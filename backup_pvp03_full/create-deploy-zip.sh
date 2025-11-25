#!/bin/bash
# Bash script to create Netlify deploy ZIP with source files
# This script creates a ZIP file with all necessary source files for Netlify deployment

echo "Creating Netlify deploy ZIP..."

# Create temporary directory
TEMP_DIR="netlify-deploy-temp"
rm -rf "$TEMP_DIR"
mkdir "$TEMP_DIR"

echo "Copying source files..."

# Copy source files
cp -r src "$TEMP_DIR/src"
cp package.json "$TEMP_DIR/package.json"
cp tsconfig.json "$TEMP_DIR/tsconfig.json"
cp vite.config.ts "$TEMP_DIR/vite.config.ts"
cp netlify.toml "$TEMP_DIR/netlify.toml"
cp index.html "$TEMP_DIR/index.html"

# Create ZIP file
ZIP_FILE="netlify-deploy.zip"
rm -f "$ZIP_FILE"

echo "Creating ZIP file: $ZIP_FILE"
cd "$TEMP_DIR"
zip -r "../$ZIP_FILE" .
cd ..

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "✅ ZIP file created successfully: $ZIP_FILE"
echo ""
echo "Next steps:"
echo "1. Go to Netlify Dashboard"
echo "2. Click 'Deploy manually'"
echo "3. Upload: $ZIP_FILE"
echo "4. Netlify will automatically run: npm install && npm run build"
echo "5. Check build log - should see '✓ 90 modules transformed'"


