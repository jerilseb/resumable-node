const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const mkDir = promisify(fs.mkdir);
const fileExists = promisify(fs.exists);
const fileRename = promisify(fs.rename);

class Resumable {
    constructor(tempDir) {
        this.temporaryFolder = tempDir;
        this.maxFileSize = 4 * 1024 * 1024 * 1024;
        this.createTempDir(tempDir);
    }

    async createTempDir(tempDir) {
        try{
            await mkDir(tempDir);
        } catch(e) {}
    }

    // Allow only alpha-numeric characters, hyphen and underscore in identifier
    cleanIdentifier(identifier){
        return identifier.replace(/^0-9A-Za-z_-/img, '');
    }

    getChunkFilename(chunkNumber, identifier){
        identifier = this.cleanIdentifier(identifier);
        return path.join(this.temporaryFolder, identifier + '.' + chunkNumber);
    }

    // Check if the request is sane
    validateRequest(chunkNumber, chunkSize, totalSize, identifier, filename, fileSize) {
        identifier = this.cleanIdentifier(identifier);
    
        if (chunkNumber==0 || chunkSize==0 || totalSize==0 || identifier.length==0 || filename.length==0) {
          return 'INVALID_REQUEST';
        }

        const numberOfChunks = Math.max(Math.floor(totalSize/(chunkSize*1.0)), 1);
        if (chunkNumber > numberOfChunks) {
          return 'INVALID_CHUNK';
        }
    
        if(this.maxFileSize && totalSize > this.maxFileSize) {
          return 'INVALID_REQUEST_FILE_TOO_BIG';
        }
    
        if(typeof(fileSize) !== 'undefined') {
          if(chunkNumber < numberOfChunks && fileSize !== chunkSize) {
            return 'CHUNK_SIZE_INVALID';
          }
          if(numberOfChunks > 1 && chunkNumber === numberOfChunks && fileSize != ((totalSize % chunkSize) + chunkSize)) {
            return 'FINAL_CHUNK_SIZE_INVALID';
          }
          if(numberOfChunks == 1 && fileSize != totalSize) {
            return 'FILE_SIZE_INVALID';
          }
        }
        return 'VALID';
    }

    async get(req) {
        const chunkNumber = parseInt(req.query['resumableChunkNumber']) || 0;
        const chunkSize = parseInt(req.query['resumableChunkSize']) || 0;
        const totalSize = parseInt(req.query['resumableTotalSize']) || 0;
        const identifier = req.query['resumableIdentifier'] || "";
        const filename = req.query['resumableFilename'] || "";
    
        if(this.validateRequest(chunkNumber, chunkSize, totalSize, identifier, filename) === 'VALID') {
            const chunkFilename = this.getChunkFilename(chunkNumber, identifier);
            const exists = await fileExists(chunkFilename)
            if(exists){
                return ['found', chunkFilename, filename, identifier];
            } else {
                return ['not_found', null, null, null];
            }
        } else {
            return ['not_found', null, null, null]
        }
    }

    async post(req) {
        const fields = req.body;
        const files = req.files;
    
        const chunkNumber = parseInt(fields['resumableChunkNumber']) || 0;
        const chunkSize = parseInt(fields['resumableChunkSize']) || 0;
        const totalSize = parseInt(fields['resumableTotalSize']) || 0;
        const identifier = this.cleanIdentifier(fields['resumableIdentifier']);
        const filename = fields['resumableFilename'];
        const original_filename = fields['resumableIdentifier'];
    
        if(!files['file'] || !files['file'].size) {
          return ['invalid_resumable_request', null, null, null];
        }

        const validation = this.validateRequest(chunkNumber, chunkSize, totalSize, identifier, filename, files['file'].size);
        if(validation === 'VALID') {
            const chunkFilename = this.getChunkFilename(chunkNumber, identifier);
            await fileRename(files['file'].path, chunkFilename);
    
            // Do we have all the chunks?
            let currentTestChunk = 1;
            const numberOfChunks = Math.max(Math.floor(totalSize/(chunkSize*1.0)), 1);

            while(true) {
                const exists = await fileExists(this.getChunkFilename(currentTestChunk, identifier));
                if(!exists) return ['partly_done', filename, identifier];
            
                currentTestChunk++;
                if(currentTestChunk > numberOfChunks) {
                    const stream = fs.createWriteStream('./uploads/' + filename);
                    await this.write(identifier, stream);
                    return ['done', filename, identifier];
                }
            }
        } else {
              return [validation, filename, identifier];
        }        
    }

    async write(identifier, writableStream, options) {
        options = options || {};
        options.end = (typeof options['end'] == 'undefined' ? true : options['end']);
  
        // Iterate over each chunk
        const $ = this;
        async function pipeChunk(number) {
            const chunkFilename = $.getChunkFilename(number, identifier);
            const exists = await fileExists(chunkFilename);
            if (exists) {
                // If the chunk with the current number exists,
                // then create a ReadStream from the file
                // and pipe it to the specified writableStream.
                const sourceStream = fs.createReadStream(chunkFilename);
                sourceStream.pipe(writableStream, {
                    end: false
                });
                sourceStream.on('end', async () => {
                    // When the chunk is fully streamed,
                    // jump to the next one
                    await pipeChunk(number + 1);
                });
            } else {
                // When all the chunks have been piped, end the stream
                if (options.end) writableStream.end();
                if (options.onDone) options.onDone();
            }
        }
        await pipeChunk(1);
    }

    async clean(identifier, options) {
        options = options || {};

        // Iterate over each chunk
        const $ = this;
        async function pipeChunkRm(number) {
            const chunkFilename = $.getChunkFilename(number, identifier);
            const exists = await fileExists(chunkFilename);
            if (exists) {
                console.log('Removing ', chunkFilename);
                fs.unlink(chunkFilename, err => {
                    if (err && options.onError) options.onError(err);
                });
                await pipeChunkRm(number + 1);
            } else {
                if (options.onDone) options.onDone();
            }
        }
        await pipeChunkRm(1);
    }
}

module.exports = Resumable;
