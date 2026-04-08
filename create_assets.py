try:
    from PIL import Image, ImageDraw, ImageFont
    
    # Create icon.png (1024x1024)
    img = Image.new('RGB', (1024, 1024), color='#8B0000')
    img.save('assets/icon.png')
    print("✓ Created icon.png")
    
    # Create splash-icon.png (1024x1024)
    img = Image.new('RGB', (1024, 1024), color='#8B0000')
    img.save('assets/splash-icon.png')
    print("✓ Created splash-icon.png")
    
    # Create adaptive-icon.png (1024x1024)
    img = Image.new('RGB', (1024, 1024), color='#8B0000')
    img.save('assets/adaptive-icon.png')
    print("✓ Created adaptive-icon.png")
    
    # Create favicon.png (48x48)
    img = Image.new('RGB', (48, 48), color='#8B0000')
    img.save('assets/favicon.png')
    print("✓ Created favicon.png")
    
    print("\nAll assets created successfully!")
    
except ImportError:
    print("PIL/Pillow not installed. Creating minimal PNG files...")
    # Minimal 1x1 PNG (red pixel)
    minimal_png = bytes([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
        0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
        0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D,
        0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
        0x44, 0xAE, 0x42, 0x60, 0x82
    ])
    
    for filename in ['icon.png', 'splash-icon.png', 'adaptive-icon.png', 'favicon.png']:
        with open(f'assets/{filename}', 'wb') as f:
            f.write(minimal_png)
        print(f"✓ Created {filename}")
    
    print("\nMinimal assets created. You may want to replace them with proper images later.")
