import boto3
import json
import os

client = boto3.client('rekognition')

def handler(event, context):
    response = client.detect_faces(
        Image={
            'S3Object': {
                'Bucket': os.environ['BUCKET_BUCKET_NAME'],
                'Name': 'test.jpg'
            }
        }
    )
    print(response)
    return {
        "statusCode": 200,
        "headers": {},
        "body": json.dumps(response)
    }

if __name__ == '__main__':
    response = handler({}, {})
    print(response)
