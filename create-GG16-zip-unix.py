#!/usr/bin/env python3
"""
Create GG16.zip with Unix-style paths for Netlify deployment
This ensures compatibility with Netlify's Linux-based build environment
"""

import os
import zipfile
import sys

def create_zip():
    zip_path = "GG16.zip"
    source_dir = "GG16"
    
    if not os.path.exists(source_dir):
        print(f"Error: {source_dir} directory not found!")
        sys.exit(1)
    
    # Remove existing zip if it exists
    if os.path.exists(zip_path):
        os.remove(zip_path)
        print(f"Removed existing {zip_path}")
    
    # Create zip file with Unix-style paths
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(source_dir):
            for file in files:
                file_path = os.path.join(root, file)
                # Use forward slashes for Unix compatibility
                arcname = os.path.relpath(file_path, source_dir).replace('\\', '/')
                zipf.write(file_path, arcname)
                print(f"Added: {arcname}")
    
    print(f"\nSuccessfully created {zip_path}")
    file_size = os.path.getsize(zip_path) / 1024
    print(f"File size: {file_size:.2f} KB")

if __name__ == "__main__":
    create_zip()


