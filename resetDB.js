/**
 * Database Reset Script
 * 
 * WARNING: This will DELETE ALL DATA in the database!
 * Run with: node resetDB.js
 */

const mongoose = require("mongoose");
const dotenv = require("dotenv");
const readline = require("readline");

// Load env vars
dotenv.config({ path: "./config/config.env" });

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question(
  "\n⚠️  WARNING: This will DELETE ALL DATA in the database!\nType 'YES' to confirm: ",
  async (answer) => {
    if (answer !== "YES") {
      console.log("❌ Cancelled. No data was deleted.");
      rl.close();
      process.exit(0);
    }

    try {
      // Connect to database
      const conn = await mongoose.connect(process.env.MONGO_URI);
      console.log(`\nConnected to: ${conn.connection.host}`);
      console.log(`Database: ${conn.connection.name}\n`);

      // Get all collections
      const collections = await mongoose.connection.db.listCollections().toArray();

      if (collections.length === 0) {
        console.log("Database is already empty!");
      } else {
        console.log(`Found ${collections.length} collection(s). Dropping...\n`);

        for (const collection of collections) {
          await mongoose.connection.db.dropCollection(collection.name);
          console.log(`  ✅ Dropped: ${collection.name}`);
        }

        console.log(`\n🗑️  All ${collections.length} collection(s) deleted successfully!`);
      }

      console.log("\nYou can now register a fresh Super Admin account.");
    } catch (err) {
      console.error("❌ Error:", err.message);
    } finally {
      rl.close();
      await mongoose.disconnect();
      process.exit(0);
    }
  }
);