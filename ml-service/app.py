from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route('/')
def home():
    return jsonify({'message': 'ML Service running'})

@app.route('/predict', methods=['POST'])
def predict():
    return jsonify({
        'disease': 'Sample',
        'confidence': 0.95,
        'recommendation': 'Use fungicide'
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
