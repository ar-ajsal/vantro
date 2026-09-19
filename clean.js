const fs = require('fs');
const html = fs.readFileSync('storefront/index.html', 'utf8');
const regex = /(<div class="product-grid-container-template[^"]*"[^>]*>)([\s\S]*?)(<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>)/;
const match = html.match(regex);
if (match) {
    const containerOpen = match[1];
    let inner = match[2];
    const itemRegex = /<div class="product-grid-item-template[^"]*"[\s\S]*?<\/a>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/g;
    const items = inner.match(itemRegex);
    if (items && items.length > 1) {
        console.log('Found ' + items.length + ' dummy items, keeping only the first one.');
        inner = items[0];
        const newHtml = html.replace(regex, containerOpen + '\n' + inner + '\n</div></div></div></div></div></div>');
        fs.writeFileSync('storefront/index.html', newHtml);
        console.log('Cleaned up index.html dummy products.');
    } else {
        console.log('Could not parse items properly or already cleaned.');
    }
} else {
    console.log('Could not find grid container.');
}
