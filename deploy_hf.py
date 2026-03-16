"""
Deploy SmartAgriCare ML service to Hugging Face Spaces.
Usage: python deploy_hf.py <hf_token>
"""
import sys
import os
from huggingface_hub import HfApi, create_repo

SPACE_ID = "sac0011/smartagricare-ml"  # Change if you want a different name
HF_SPACE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hf-space")
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "best_swin_crop_disease.pth")

def main():
    if len(sys.argv) < 2:
        print("Usage: python deploy_hf.py <hf_token>")
        print("Get your token from: https://huggingface.co/settings/tokens")
        sys.exit(1)

    token = sys.argv[1]
    api = HfApi(token=token)

    # Verify login
    user = api.whoami()
    username = user["name"]
    space_id = f"{username}/smartagricare-ml"
    print(f"Logged in as: {username}")
    print(f"Space ID: {space_id}")

    # Create Space repo (or skip if exists)
    try:
        create_repo(space_id, repo_type="space", space_sdk="docker", token=token, exist_ok=True)
        print(f"Space created/verified: {space_id}")
    except Exception as e:
        print(f"Error creating space: {e}")
        sys.exit(1)

    # Upload all files from hf-space directory
    print("Uploading application files...")
    for fname in os.listdir(HF_SPACE_DIR):
        fpath = os.path.join(HF_SPACE_DIR, fname)
        if os.path.isfile(fpath):
            print(f"  Uploading {fname}...")
            api.upload_file(
                path_or_fileobj=fpath,
                path_in_repo=fname,
                repo_id=space_id,
                repo_type="space",
                token=token,
            )

    # Upload the model file (332MB — will use LFS automatically)
    print("Uploading model file (332MB — this will take a few minutes)...")
    api.upload_file(
        path_or_fileobj=MODEL_PATH,
        path_in_repo="best_swin_crop_disease.pth",
        repo_id=space_id,
        repo_type="space",
        token=token,
    )

    print(f"\nDeployment complete!")
    print(f"Space URL: https://huggingface.co/spaces/{space_id}")
    print(f"API URL:   https://{username}-smartagricare-ml.hf.space")
    print(f"\nThe Space will build and start automatically. It may take 5-10 minutes.")
    print(f"Once running, update your Render ML_SERVICE_URL env var to:")
    print(f"  https://{username}-smartagricare-ml.hf.space")

if __name__ == "__main__":
    main()
