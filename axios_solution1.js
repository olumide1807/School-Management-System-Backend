// import React, { useState } from 'react';
// import axios from 'axios';

// const MyComponent = () => {
//     const [file, setFile] = useState(null);
//     const [formData, setFormData] = useState({
//         // Add any other fields you want to include in the request body
//         fieldName: '',
//         // ...
//     });

//     const handleSubmit = async (e) => {
//         e.preventDefault();

//         try {
//             const formData = new FormData();
//             formData.append('file', file);
//             // Append other form data fields to the FormData object
//             formData.append('fieldName', formData.fieldName);
//             // ...

//             // Make the POST request using Axios
//             const response = await axios.post('/upload', formData, {
//                 headers: {
//                     'Content-Type': 'multipart/form-data'
//                 }
//             });

//             console.log('Response:', response.data);
//         } catch (error) {
//             console.error('Error:', error);
//         }
//     };

//     return (
//         <form onSubmit={handleSubmit}>
//             <input type="file" onChange={(e) => setFile(e.target.files[0])} />
//             {/* Add input fields for other form data */}
//             <input type="text" value={formData.fieldName} onChange={(e) => setFormData({ ...formData, fieldName: e.target.value })} />
//             {/* ... */}
//             <button type="submit">Upload</button>
//         </form>
//     );
// };

// export default MyComponent;
