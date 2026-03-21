# Carpeta `game/`

Aquí deben colocarse los archivos exportados del proyecto Godot en formato HTML5.

## Pasos para exportar

1. Abre el proyecto **MathLienLand** en Godot 4.x
2. Ve a **Project → Export**
3. Selecciona la plantilla **Web (HTML5)**
   - Si no tienes las plantillas de exportación, descárgalas desde *Export → Manage Export Templates*
4. En la ruta de exportación escribe: `ruta/a/esta/carpeta/game/index.html`
5. Haz clic en **Export Project**

Godot generará estos archivos (entre otros):
- `index.html`
- `index.js`
- `index.wasm`
- `index.pck`
- `index.audio.worklet.js`
- `index.worker.js`

## Ejecutar localmente

Los juegos HTML5 de Godot **no funcionan abriendo el archivo directamente** en el navegador
(requieren un servidor HTTP por el uso de SharedArrayBuffer y COOP/COEP headers).

Usa uno de estos métodos:

```bash
# Opción 1: Python (si lo tienes instalado)
python3 -m http.server 8080
# luego abre http://localhost:8080 en el navegador

# Opción 2: Node.js
npx serve .
# luego abre la URL que te indique

# Opción 3: Extensión de VS Code
# Instala "Live Server" y haz clic en "Go Live"
```
