var express = require('express');
var resumable = require('./resumable-node.js')('./tmp/');
var app = express();
var multipart = require('connect-multiparty');
var crypto = require('crypto');

// Host most stuff in the public folder
app.use(express.static(__dirname + '/public'));
app.use(multipart());

// Uncomment to allow CORS
app.use( (req, res, next) => {
   res.header('Access-Control-Allow-Origin', '*');
   next();
});

app.get('/status', (req, res) => {
    res.send('OK');
});


// retrieve file id. invoke with /fileid?filename=my-file.jpg
app.get('/fileid', (req, res) => {
  if(!req.query.filename){
    return res.status(500).end('query parameter missing');
  }
  // create md5 hash from filename
  res.end(
    crypto.createHash('md5')
    .update(req.query.filename)
    .digest('hex')
  );
});

// Handle uploads through Resumable.js
app.post('/uploadchunks', (req, res) => {
    console.log(req.query);
    resumable.post(req, (status, filename, original_filename, identifier) => {
        console.log('POST', status,'FILENAME: ', filename, 'ORIGINAL_FILENAME: ', original_filename, 'IDENTIFIER: ', identifier);
        res.send(status);
    });
});

// Handle status checks on chunks through Resumable.js
app.get('/uploadchunks', (req, res) => {
    resumable.get(req, (status, filename, original_filename, identifier) => {
        console.log('GET', status);
        res.send((status == 'found' ? 200 : 404), status);
    });
});

app.get('/download/:identifier', (req, res) => {
	resumable.write(req.params.identifier, res);
});

app.listen(3000, () => {
  console.log("Express server listening on port 3000");
});
