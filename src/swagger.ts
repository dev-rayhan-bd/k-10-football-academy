import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

const yamlPath = path.join(__dirname, 'swagger.yaml');
const jsonPath = path.join(__dirname, 'swagger.json');

try {
  if (fs.existsSync(yamlPath)) {
    const yamlContent = fs.readFileSync(yamlPath, 'utf8');
    const swaggerObj = YAML.parse(yamlContent);
    fs.writeFileSync(jsonPath, JSON.stringify(swaggerObj, null, 2));
    console.log(
      '✅ Swagger documentation compiled successfully from swagger.yaml to src/swagger.json',
    );
  } else {
    console.error('❌ src/swagger.yaml not found!');
  }
} catch (err) {
  console.error('❌ Error generating swagger.json:', err);
}
