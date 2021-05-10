const express = require('express')
const bodyParser = require('body-parser')
const mongoose = require('mongoose')
const axios = require('axios')

const AWS = require('aws-sdk')
AWS.config.update({region: 'us-east-1'})

const rekognition = new AWS.Rekognition

const fs = require('fs')
const util = require('util')
const unlinkFile = util.promisify(fs.unlink)

const multer = require('multer')
const upload = multer({ dest: 'uploads/' })

const { uploadFile, getFileStream } = require('./s3')

const app = express()

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization'
    );
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
  
    next();
  });

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json());



const imgSchema = new mongoose.Schema({
    Key: {type: String, required: true},
    keywords: { type: Array }
  });

const Img = mongoose.model('Img', imgSchema)

const URI = process.env.URI
const connectDB = async()=>{
await mongoose.connect(URI, {useUnifiedTopology: true, useNewUrlParser: true});
console.log('db connected!');
};

connectDB()

app.get('/images/:key', (req, res) => {
  console.log(req.params)
  const key = req.params.key
  const readStream = getFileStream(key)
  readStream.pipe(res)
})

app.get('/api/getAllImages', async (req, res) => {
    const arr = await Img.find({}, 'Key keywords').exec()
    res.json({'images': arr})
})

app.get('/api/getImageID/:searchVal', async (req,res)=>{
    const images = await Img.find({})
    let arr = []
    let finalArr = []
    for (let i = 0; i < images.length; i++){
        arr = images[i].keywords.filter(element => element.includes(req.params.searchVal))
        if (arr.length) {
            finalArr.push(images[i].Key)
        }
    }
    res.json({'searchResults': finalArr})

})

app.post('/api/addImg', upload.single('image'), async (req, res) => {
  const file = req.file

  let originalname = file.originalname.split("")
  orignalname = originalname.slice(0, file.originalname.lastIndexOf('.')+1)
  let newname = originalname.slice(0, file.originalname.lastIndexOf('.'))

  const result = await uploadFile(file)
  await unlinkFile(file.path)

  var params = {
    Image: {
     S3Object: {
      Bucket: process.env.AWS_BUCKET_NAME, 
      Name: result.Key
     }
    }, 
    MaxLabels: 123, 
    MinConfidence: 70
   };

   rekognition.detectLabels(params, function(err, data) {
        if (err) {
            console.log('here');
            console.log(err, err.stack);
        }
        else{
            let arr = []
            for (let i = 0; i < data.Labels.length; i++){
                arr.push(data.Labels[i].Name.toLowerCase())
                if (i == data.Labels.length-1){
                    arr.push(newname.join(''))
                    const newImg = new Img({
                        Key: result.Key,
                        keywords: arr
                    })
                    newImg.save()
                }
            }
        } 
    })
    
  res.send({imagePath: `/images/${result.Key}`})
})

app.listen(process.env.PORT, () => console.log('running'))