const fs = require('fs');
const file = 'src/components/ManualProcedimientos.jsx';
let code = fs.readFileSync(file, 'utf8');

// 1. Remove checkPage calls globally
code = code.replace(/(\w+)\s*=\s*checkPage\(doc,\s*\1,\s*counters,\s*(\d+)\);/g, "\ = (\ + \ > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : \;");
code = code.replace(/(\w+)\s*=\s*checkPage\(doc,\s*\1,\s*(\d+),\s*counters\);/g, "\ = (\ + \ > doc.internal.pageSize.getHeight() - 40) ? addPage(doc, counters) : \;");

// 2. Fix the loop that patches totalPages with blue rectangles
code = code.replace(/\/\/ Actualizar el total de p[\s\S]*?doc\.setPage\(counters\.page\);/, "doc.putTotalPages('{total_pages_count_string}'); doc.setPage(counters.page);");

// 3. Fix drawHeader(doc, 1, 999)
code = code.replace(/drawHeader\(doc, 1, 999\);/g, "drawHeader(doc, 1, '{total_pages_count_string}');");

// 4. Update the fallback logic in drawHeader to support string
code = code.replace(/totalPages \? totalPages : '\.\.\.'/g, "totalPages || '{total_pages_count_string}'");

fs.writeFileSync(file, code);
console.log('Fixed runtime errors!');
