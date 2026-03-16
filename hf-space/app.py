"""
SmartAgriCare ML Service — Swin-B Crop Disease Detection
Deployed on Hugging Face Spaces (Docker SDK).
Loads a trained Swin Transformer (Base) model and serves predictions
via Flask API on port 7860. Returns disease data from crop_disease_data.json.
"""
import os
import io
import json
import logging
import threading
import numpy as np
import torch
import torch.nn.functional as F
from torchvision import transforms
from PIL import Image
import timm
from flask import Flask, request, jsonify
from flask_cors import CORS

# ── Logging ───────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger(__name__)

app = Flask(__name__)
# Allow requests from Render backend and local dev
_cors_origins = [
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    'https://smartagricare.onrender.com',
]
if os.environ.get('BACKEND_URL'):
    _cors_origins.append(os.environ['BACKEND_URL'])
CORS(app, origins=_cors_origins)
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10 MB max upload

# Serialize model inference — PyTorch is not thread-safe on CPU
_inference_lock = threading.Lock()
torch.set_num_threads(min(os.cpu_count() or 2, 4))

# Concurrency limiter — cap in-flight requests to prevent OOM
_max_concurrent = threading.Semaphore(8)

# PIL decompression bomb protection
Image.MAX_IMAGE_PIXELS = 4_000_000  # ~2000x2000 max decoded pixels

# ── Paths (all files in same directory on HF Spaces) ─────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, 'best_swin_crop_disease.pth')
DISEASE_DATA_PATH = os.path.join(BASE_DIR, 'crop_disease_data.json')

# ── Load disease data ──────────────────────────────────────────
with open(DISEASE_DATA_PATH, 'r', encoding='utf-8') as f:
    DISEASE_DATA = json.load(f)

# ── Class index → (crop_key, disease_key) in crop_disease_data.json ──
CLASS_MAP = [
    ('cotton', 'aphids'),                       # 0
    ('cotton', 'army_worm'),                    # 1
    ('cotton', 'bacterial_blight'),             # 2
    ('paddy', 'blast'),                         # 3
    ('paddy', 'brownspot'),                     # 4
    ('corn_maize', 'cercospora_leaf_spot'),     # 5
    ('corn_maize', 'common_rust'),              # 6
    ('corn_maize', 'northern_leaf_blight'),     # 7
    ('corn_maize', 'healthy'),                  # 8
    ('paddy', 'healthy'),                       # 9
    ('cotton', 'powdery_mildew'),               # 10
    ('sugarcane', 'mosiac'),                    # 11
    ('sugarcane', 'healthy'),                   # 12
    ('sugarcane', 'redrot'),                    # 13
    ('sugarcane', 'rust'),                      # 14
    ('sugarcane', 'yellow'),                    # 15
    ('cotton', 'target_spot'),                  # 16
    ('paddy', 'tungro'),                        # 17
]

NUM_CLASSES = len(CLASS_MAP)  # 18

# ── Image preprocessing (ImageNet normalization, 384x384) ──────
transform = transforms.Compose([
    transforms.Resize((384, 384)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])


def is_plant_like(pil_img, min_plant_ratio=0.30):
    """
    Multi-check image validation for crop leaf images.
    Returns (is_plant, details_dict).
    """
    thumb = pil_img.resize((128, 128))
    arr = np.array(thumb, dtype=np.float32) / 255.0
    thumb.close()
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]

    cmax = np.maximum(np.maximum(r, g), b)
    cmin = np.minimum(np.minimum(r, g), b)
    delta = cmax - cmin

    hue = np.zeros_like(delta)
    mask = delta > 0
    mask_r = mask & (cmax == r)
    mask_g = mask & (cmax == g)
    mask_b = mask & (cmax == b)
    hue[mask_r] = 60 * (((g[mask_r] - b[mask_r]) / delta[mask_r]) % 6)
    hue[mask_g] = 60 * (((b[mask_g] - r[mask_g]) / delta[mask_g]) + 2)
    hue[mask_b] = 60 * (((r[mask_b] - g[mask_b]) / delta[mask_b]) + 4)

    sat = np.where(cmax > 0, delta / cmax, 0)
    val = cmax

    plant_mask = (
        ((hue >= 30) & (hue <= 150) & (sat > 0.20) & (val > 0.12)) |
        ((hue >= 10) & (hue < 30) & (sat > 0.20) & (val > 0.12) & (val < 0.65))
    )

    plant_ratio = np.count_nonzero(plant_mask) / plant_mask.size
    green_dom = np.count_nonzero((g > r) & (g > b)) / plant_mask.size

    gray = 0.299 * r + 0.587 * g + 0.114 * b
    gx = np.abs(np.diff(gray, axis=1))
    gy = np.abs(np.diff(gray, axis=0))
    edge_density = (gx.mean() + gy.mean()) / 2.0

    h, w = arr.shape[:2]
    bh, bw = max(1, h // 4), max(1, w // 4)
    block_colors = []
    for bi in range(4):
        for bj in range(4):
            block = arr[bi*bh:(bi+1)*bh, bj*bw:(bj+1)*bw]
            block_colors.append(block.mean(axis=(0, 1)))
    block_colors = np.array(block_colors)
    color_variance = block_colors.var(axis=0).sum()

    details = {
        'plant_ratio': round(plant_ratio, 3),
        'green_dominance': round(green_dom, 3),
        'edge_density': round(float(edge_density), 4),
        'color_variance': round(float(color_variance), 4),
    }

    fails = []
    if plant_ratio < min_plant_ratio:
        fails.append('low_plant_ratio')
    if color_variance > 0.04:
        fails.append('high_color_variance')
    if green_dom < 0.15 and plant_ratio < 0.50:
        fails.append('low_green_dominance')

    is_plant = len(fails) == 0
    details['fails'] = fails
    return is_plant, details


def compute_energy_score(logits_tensor, temperature=1.0):
    """Energy-based OOD score (Liu et al., 2020)."""
    energy = -temperature * torch.logsumexp(logits_tensor / temperature, dim=1)
    return energy.item()

# ── Load Swin-B model ─────────────────────────────────────────
logger.info('Loading model from %s ...', MODEL_PATH)
checkpoint = torch.load(MODEL_PATH, map_location='cpu', weights_only=False)

model = timm.create_model('swin_base_patch4_window12_384',
                          pretrained=False,
                          num_classes=NUM_CLASSES)
model.load_state_dict(checkpoint['model_state_dict'])
model.eval()

val_acc = checkpoint.get('val_acc', 'N/A')
epoch = checkpoint.get('epoch', 'N/A')
class_names = checkpoint.get('class_names', [])
logger.info('Model loaded  epoch %s, val_acc %s', epoch, val_acc)
logger.info('Classes (%d): %s', len(class_names), class_names)

HEALTHY_INDICES = {8, 9, 12}

CROP_DISPLAY = {
    'corn_maize': 'Corn / Maize',
    'cotton': 'Cotton',
    'paddy': 'Paddy (Rice)',
    'sugarcane': 'Sugarcane',
}


# ── Routes ─────────────────────────────────────────────────────
@app.errorhandler(413)
def too_large(_e):
    return jsonify({'error': 'Image too large. Maximum size is 10 MB.'}), 413


@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'model': 'swin_base_patch4_window12_384',
        'classes': NUM_CLASSES,
        'val_acc': str(val_acc),
    })


@app.route('/predict', methods=['POST'])
def predict():
    # Concurrency cap — reject immediately if overloaded
    if not _max_concurrent.acquire(blocking=False):
        return jsonify({'error': 'Service busy. Try again later.'}), 503

    img = None
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No image file. Send multipart with field "image".'}), 400

        file = request.files['image']

        content_length = request.content_length or 0
        if content_length > 10 * 1024 * 1024:
            return jsonify({'error': 'Image too large. Maximum size is 10 MB.'}), 413

        try:
            img = Image.open(file.stream).convert('RGB')
        except (IOError, OSError, Image.DecompressionBombError) as e:
            logger.warning('Invalid image upload: %s', e)
            return jsonify({'error': 'Invalid image file.'}), 400

        w, h = img.size
        if w * h > 4_000_000:
            img.close()
            return jsonify({'error': 'Image dimensions too large. Max ~2000x2000 pixels.'}), 400

        # ── Layer 1: Multi-check plant image validation ──
        plant_like, img_details = is_plant_like(img)
        if not plant_like:
            img.close()
            return jsonify({
                'status': 'unrecognized',
                'disease': 'Unrecognized',
                'confidence': 0.0,
                'crop': '',
                'cause': '',
                'treatment': [],
                'medication_timeline': [],
                'max_sprays': '',
                'is_viral': False,
                'viral_note': '',
                'stores': [],
                'message': 'This image does not appear to contain a plant or crop leaf. '
                           'Please upload a clear, close-up photo of the affected leaf.',
                '_rejection_reason': 'color_precheck',
                '_details': img_details,
            })

        tensor = transform(img).unsqueeze(0)
        img.close()

        acquired = _inference_lock.acquire(timeout=30)
        if not acquired:
            del tensor
            return jsonify({'error': 'Service overloaded. Try again later.'}), 503

        try:
            with torch.no_grad():
                logits = model(tensor)
                probs = F.softmax(logits, dim=1)
                confidence, pred_idx = torch.max(probs, dim=1)
                energy = compute_energy_score(logits)
        finally:
            _inference_lock.release()

        idx = pred_idx.item()
        conf = round(confidence.item(), 4)

        probs_np = probs[0].detach().cpu()
        sorted_probs, _ = torch.sort(probs_np, descending=True)
        top1 = sorted_probs[0].item()
        top2 = sorted_probs[1].item()
        margin = top1 - top2

        p = probs_np.detach()
        prob_entropy = -torch.sum(p * torch.log(p + 1e-10)).item()

        del tensor, logits, probs, confidence, pred_idx, probs_np, sorted_probs, p

        energy_ood = energy > -3.0
        confidence_ood = (top1 < 0.75) or (top1 < 0.85 and margin < 0.20)

        # ── Layer 4: Healthy class skepticism ──
        is_healthy_pred = idx in HEALTHY_INDICES
        healthy_skeptic = False
        if is_healthy_pred:
            if img_details['color_variance'] > 0.02 or top1 < 0.90:
                healthy_skeptic = True

        is_unrecognized = energy_ood or confidence_ood or healthy_skeptic

        if is_unrecognized:
            reasons = []
            if energy_ood: reasons.append('energy')
            if confidence_ood: reasons.append('confidence')
            if healthy_skeptic: reasons.append('healthy_skeptic')
            return jsonify({
                'status': 'unrecognized',
                'disease': 'Unrecognized',
                'confidence': conf,
                'crop': '',
                'cause': '',
                'treatment': [],
                'medication_timeline': [],
                'max_sprays': '',
                'is_viral': False,
                'viral_note': '',
                'stores': [],
                'message': 'This image does not appear to be a recognizable crop leaf. '
                           'Please upload a clear, close-up photo of the affected leaf for accurate diagnosis.',
                '_rejection_reason': '+'.join(reasons),
                '_energy': round(energy, 2),
                '_entropy': round(prob_entropy, 3),
                '_top1': round(top1, 4),
                '_margin': round(margin, 4),
                '_details': img_details,
            })

        crop_key, disease_key = CLASS_MAP[idx]
        disease_info = DISEASE_DATA.get(crop_key, {}).get(disease_key, {})

        if disease_info.get('status') == 'healthy':
            return jsonify({
                'status': 'healthy',
                'crop': CROP_DISPLAY.get(crop_key, crop_key),
                'disease': 'Healthy',
                'confidence': conf,
                'message': disease_info.get('message', 'No disease detected. Crop is healthy.'),
            })

        return jsonify({
            'status': 'diseased',
            'crop': disease_info.get('crop', CROP_DISPLAY.get(crop_key, crop_key)),
            'disease': disease_info.get('disease', 'Unknown'),
            'confidence': conf,
            'cause': disease_info.get('cause_of_disease', ''),
            'treatment': disease_info.get('treatment', []),
            'medication_timeline': disease_info.get('medication_timeline', []),
            'max_sprays': disease_info.get('max_sprays', ''),
            'is_viral': disease_info.get('is_viral', False),
            'viral_note': disease_info.get('viral_note', ''),
            'deficiencies': disease_info.get('deficiencies', []),
            'disorders': disease_info.get('disorders', []),
            'natural_organic_treatment': disease_info.get('natural_organic_treatment', []),
            'stores': [],
        })

    finally:
        if img is not None and hasattr(img, 'close'):
            try:
                img.close()
            except Exception:
                pass
        _max_concurrent.release()


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 7860))
    logger.info('SmartAgriCare ML Service starting on port %d...', port)
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
