const getAll = async (model) => {
    try {
      // Use the find method to retrieve all documents
      const items = await model.find({});
      return items;
    } catch (error) {
      throw new Error(`Error while fetching ${model.modelName}s`);
    }
  };
  
  const getById = async (model, itemId) => {
    try {
      // Use the findById method to retrieve a document by ID
      const item = await model.findById(itemId);
      return item;
    } catch (error) {
      throw new Error(`Error while fetching ${model.modelName} by ID`);
    }
  };

  const getByEmail = async (model, email) => {
    try {
      const item = await model.findOne({ email: email });
      return item;
    } catch (error) {
      throw new Error(`Error while fetching ${model.modelName}`);
    }
  }
  
  const create = async (model, itemData) => {
    try {
      // Use the create method to create a new document
      const newItem = await model.create(itemData);
      return newItem;
    } catch (error) {
      throw new Error(`Error while creating ${model.modelName}`, error);
    }
  };
  
  const update = async (model, itemId, updatedData) => {
    try {
      // Use the findByIdAndUpdate method to update a document by ID
      const updatedItem = await model.findByIdAndUpdate(itemId, updatedData, {
        new: true, // Return the updated document
      });
      return updatedItem;
    } catch (error) {
      throw new Error(`Error while updating ${model.modelName}`);
    }
  };
  
  const remove = async (model, itemId) => {
    try {
      // Use the findByIdAndDelete method to delete a document by ID
      const deletedItem = await model.findByIdAndDelete(itemId);
      return deletedItem;
    } catch (error) {
      throw new Error(`Error while deleting ${model.modelName}`);
    }
  };
  
  module.exports = {
    getAll,
    getById,
    getByEmail,
    create,
    update,
    remove,
  };
  