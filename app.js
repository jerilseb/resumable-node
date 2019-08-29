var express = require('express');
var app = express();
var multipart = require('connect-multiparty');
// var crypto = require('crypto');

const Resume = require('./resumable.js');
const resumable = new Resume('./tmp/');

// Host most stuff in the public folder
app.use(express.static(__dirname + '/public'));
app.use(multipart());

// Uncomment to allow CORS
app.use( (req, res, next) => {
   res.header('Access-Control-Allow-Origin', '*');
   res.header('Access-Control-Allow-Headers', '*');
   next();
});

app.get('/status', (req, res) => {
    res.send('OK');
});

// retrieve file id. invoke with /fileid?filename=my-file.jpg
// app.get('/fileid', (req, res) => {
//   if(!req.query.filename){
//     return res.status(500).end('query parameter missing');
//   }
//   // create md5 hash from filename
//   res.end(
//     crypto.createHash('md5')
//     .update(req.query.filename)
//     .digest('hex')
//   );
// });

// Handle uploads through Resumable.js
app.post('/chunks', async (req, res) => {
    const [status, filename, identifier] = await resumable.post(req);
    console.log('POST', status, 'IDENTIFIER: ', identifier);
    res.send(status);
});

// Handle status checks on chunks through Resumable.js
app.get('/chunks', async (req, res) => {
    const [status, filename, original_filename, identifier] = await resumable.get(req);
    console.log('GET', status, filename, original_filename, identifier);
    res.send((status == 'found' ? 200 : 204), status);
});

// app.get('/download/:identifier', (req, res) => {
// 	resumable.write(req.params.identifier, res);
// });

app.listen(3000, () => {
  console.log("Express server listening on port 3000");
});
