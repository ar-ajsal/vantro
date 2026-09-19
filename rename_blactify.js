const fs = require('fs');
const path = require('path');

const dirsToScan = ['backend', 'storefront', 'admin panel'];

function walkAndReplace(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
        if (item === 'node_modules' || item === '.git' || item.endsWith('.png') || item.endsWith('.jpg') || item.endsWith('.webp') || item.endsWith('.ttf') || item.endsWith('.woff') || item.endsWith('.woff2')) continue;
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            walkAndReplace(fullPath);
        } else if (stat.isFile()) {
            let content;
            try {
                content = fs.readFileSync(fullPath, 'utf8');
            } catch (e) { continue; }
            
            let newContent = content
                .replace(/Blactify/g, 'Vantro')
                .replace(/BLACTIFY/g, 'VANTRO')
                .replace(/blactify/g, 'vantro');
                
            if (content !== newContent) {
                fs.writeFileSync(fullPath, newContent, 'utf8');
                console.log(`Updated ${fullPath}`);
            }
        }
    }
}

dirsToScan.forEach(dir => {
    if (fs.existsSync(dir)) walkAndReplace(dir);
});

if (fs.existsSync(path.join('storefront', 'blactify-api.js'))) {
    fs.renameSync(path.join('storefront', 'blactify-api.js'), path.join('storefront', 'vantro-api.js'));
    console.log('Renamed blactify-api.js to vantro-api.js');
}
