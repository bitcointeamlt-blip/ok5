#!/usr/bin/env python3
"""
Create GG7.zip with Unix path separators for Netlify deployment
"""
import os
import zipfile
from pathlib import Path

def create_zip():
    # Remove old ZIP
    zip_path = Path("GG7.zip")
    if zip_path.exists():
        zip_path.unlink()
    
    # Create ZIP with Unix paths
    with zipfile.ZipFile("GG7.zip", "w", zipfile.ZIP_DEFLATED) as zipf:
        gg7_path = Path("GG7")
        
        # Add all files from GG7 folder
        for file_path in gg7_path.rglob("*"):
            if file_path.is_file():
                # Get relative path
                relative_path = file_path.relative_to(gg7_path)
                # Convert to Unix path (forward slashes)
                unix_path = str(relative_path).replace("\\", "/")
                # Add to ZIP
                zipf.write(file_path, unix_path)
                print(f"Added: {unix_path}")
    
    # Get ZIP size
    zip_size = zip_path.stat().st_size / 1024
    print(f"\nGG7.zip created successfully!")
    print(f"Size: {zip_size:.2f} KB")
    
    # Verify critical files
    with zipfile.ZipFile("GG7.zip", "r") as zipf:
        critical_files = [
            "src/services/WalletService.ts",
            "src/services/SupabaseService.ts",
            "src/services/MatchmakingService.ts",
            "src/services/PvPSyncService.ts",
            "src/persistence/SaveDataV2.ts",
            "src/persistence/SaveManagerV2.ts",
            "src/vite-env.d.ts",
            "index.html"
        ]
        print("\nVerifying critical files:")
        for file in critical_files:
            if file in zipf.namelist():
                print(f"OK: {file}")
            else:
                print(f"MISSING: {file}")

if __name__ == "__main__":
    create_zip()

