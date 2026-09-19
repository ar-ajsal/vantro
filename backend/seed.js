require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');

const seedProducts = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { family: 4 });
    console.log('MongoDB connected for seeding...');

    // Clear existing products
    await Product.deleteMany();
    console.log('Existing products cleared.');

    const products = [
      {
        sku: 'J-001',
        title: { en: 'Elegant Silver Necklace' },
        description: { en: 'A beautiful and elegant silver necklace perfect for any occasion.' },
        slug: 'elegant-silver-necklace',
        image: ['https://images.unsplash.com/photo-1599643478524-fb66f70a0066?w=500&q=80'],
        stock: 50,
        prices: {
          price: 120,
          originalPrice: 150,
          discount: 20
        },
        status: 'show',
        isFeatured: true
      }
    ];

    await Product.insertMany(products);
    console.log(`${products.length} products seeded successfully!`);
    process.exit(0);
  } catch (error) {
    console.error('Error seeding products:', error);
    process.exit(1);
  }
};

seedProducts();
