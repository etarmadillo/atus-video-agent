const capFolder = './captures';
const path = require('path');
const { unlink } = require('fs');
const fs = require('fs');
const FormData = require('form-data');
const { default: axios } = require('axios');
const config = require('./config.json');

if (!fs.existsSync(capFolder)) {
    fs.mkdirSync(capFolder);
}

fs.readdir(capFolder, (err, files) => {
    files.forEach(file => {
        let filePath = path.join(capFolder, file);
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                console.error(err)
                return
            }
            const form = new FormData();
            form.append('capture', fs.createReadStream(filePath));
            axios.post(config.capturesEndpoint, form, { headers: form.getHeaders() })
                .then(x => {
                    unlink(filePath, (err) => {
                        if (err) throw err;
                        console.log(`Deleted ${filePath}`);
                    })
                }).catch(error =>
                    console.log(JSON.stringify(error))
                );
        })
    });
});