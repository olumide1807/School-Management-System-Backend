const mongoose = require('mongoose');


const resultSchema = new mongoose.Schema({

    school : {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SuperAdmin',
        required:true
    },


    student : {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required:true
    },
    session : {

        type: mongoose.Schema.Types.ObjectId,
        ref: 'Session',
        required:true

    },

    classLevel :{

        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClassLevel',
        required:true
    },
    classArm :{

        type: mongoose.Schema.Types.ObjectId,
        ref: 'ClassArm',
        required:true
    },
    Terms :[{
        termId : {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Term',
            // required:true
        },
        subjects:[{
            subject: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Subject',
            },
            specificSubject:{
                type: mongoose.Schema.Types.ObjectId,
                ref: 'specifcSubjet',
            },
            CA1:{
                type: Number,
                required: true
            },
            CA2:{
                type: Number,
                required: true
            },
            Exam :{
                type: Number,
                required: true
            },
            Total:{
                type: Number,
                required: true
            },
        }]
    }]





})

const result = mongoose.model('result', resultSchema)

module.exports = result