/* =============================================================
   NovaCart — Product model
   -------------------------------------------------------------
   Stored in the "products" collection.

   `id` is a human-readable numeric identifier kept alongside
   Mongo's _id. Product URLs are /product.html?id=5, so a stable
   small integer is friendlier than a 24-character ObjectId — and
   it keeps every existing link working after the migration.

   toJSON returns exactly the shape the frontend already renders,
   so the UI needed no changes when the data moved to the server.
   ============================================================= */

const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    id: {
      type: Number,
      required: [true, "Product id is required"],
      unique: true,
      index: true,
      min: [1, "Product id must be positive"]
    },

    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
      maxlength: [120, "Name must be 120 characters or fewer"]
    },

    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
      index: true
    },

    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"]
    },

    // Pre-sale price. null when the item is not discounted.
    oldPrice: {
      type: Number,
      default: null,
      min: [0, "Old price cannot be negative"],
      validate: {
        validator(value) {
          return value === null || value === undefined || value > this.price;
        },
        message: "Old price should be higher than the current price"
      }
    },

    image: {
      type: String,
      required: [true, "Image path is required"],
      trim: true
    },

    shortDescription: {
      type: String,
      required: [true, "Short description is required"],
      trim: true,
      maxlength: [200, "Short description must be 200 characters or fewer"]
    },

    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: [2000, "Description must be 2000 characters or fewer"]
    },

    features: {
      type: [String],
      default: []
    },

    rating: {
      type: Number,
      default: 0,
      min: [0, "Rating cannot be below 0"],
      max: [5, "Rating cannot exceed 5"]
    },

    reviews: {
      type: Number,
      default: 0,
      min: [0, "Review count cannot be negative"]
    },

    stock: {
      type: Number,
      required: [true, "Stock level is required"],
      default: 0,
      min: [0, "Stock cannot be negative"]
    },

    // "Sale" | "New" | null — drives the corner ribbon on product cards.
    badge: {
      type: String,
      enum: {
        values: ["Sale", "New", null],
        message: "Badge must be Sale, New, or empty"
      },
      default: null
    },

    // Shown in the home page's "Featured Products" grid.
    featured: {
      type: Boolean,
      default: false,
      index: true
    },

    // Soft delete: hidden from the store without losing order history.
    active: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        // The frontend expects `id`, not `_id`.
        delete ret._id;
        delete ret.__v;
        delete ret.active;
        delete ret.createdAt;
        delete ret.updatedAt;
        return ret;
      }
    }
  }
);

// Text index powers ?search= across the fields shoppers actually search.
productSchema.index({ name: "text", shortDescription: "text", category: "text" });

/** In stock right now? */
productSchema.virtual("inStock").get(function inStock() {
  return this.stock > 0;
});

module.exports = mongoose.model("Product", productSchema);
