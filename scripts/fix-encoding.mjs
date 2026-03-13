import fs from "node:fs";

const files = [
  "./store/working-memory-l0.json",
  "./store/working-memory-store.json",
  "./store/replay-store.json",
  "./store/vector-store.json",
];

function fixEncoding(filePath) {
  console.log(`Fixing: ${filePath}`);
  
  try {
    // 读取文件，尝试多种编码
    let raw = fs.readFileSync(filePath, "utf-8");
    
    // 移除 BOM
    raw = raw.replace(/^\uFEFF/, "");
    
    // 解析 JSON
    const data = JSON.parse(raw);
    
    // 递归清理所有字符串字段中的乱码
    function cleanObject(obj) {
      if (typeof obj === "string") {
        return obj
          .replace(/�/g, "")
          .replace(/\uFFFD/g, "")
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
      }
      if (Array.isArray(obj)) {
        return obj.map(cleanObject);
      }
      if (obj && typeof obj === "object") {
        const cleaned = {};
        for (const [key, value] of Object.entries(obj)) {
          cleaned[key] = cleanObject(value);
        }
        return cleaned;
      }
      return obj;
    }
    
    const cleaned = cleanObject(data);
    
    // 写回文件，确保 UTF-8 无 BOM
    const json = JSON.stringify(cleaned, null, 2);
    fs.writeFileSync(filePath, json, { encoding: "utf-8" });
    
    console.log(`✓ Fixed: ${filePath}`);
  } catch (error) {
    console.error(`✗ Failed: ${filePath}`, error.message);
  }
}

for (const file of files) {
  if (fs.existsSync(file)) {
    fixEncoding(file);
  } else {
    console.log(`Skip (not found): ${file}`);
  }
}

console.log("\n✓ Encoding fix complete!");
