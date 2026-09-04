# Control de Entregas PDV

Frontend estático preparado para GitHub Pages. La información se almacena en Google Sheets y las fotografías en Google Drive mediante el backend de Google Apps Script.

## Publicación

1. Subir `index.html`, `styles.css`, `app.js` y `manifest.json` a la rama principal.
2. En GitHub abrir **Settings → Pages**.
3. Seleccionar **Deploy from a branch**, rama principal y carpeta raíz.
4. Guardar y abrir la URL generada por GitHub Pages.

## Recursos vinculados

La URL pública del servicio de Google Apps Script está configurada en `app.js`.
Los identificadores internos del Sheet y de la carpeta de evidencias permanecen
únicamente en el backend de Apps Script y no se documentan en este repositorio.

Las contraseñas y fotografías no se guardan en GitHub. Las contraseñas se
almacenan como hash con sal y las fotografías permanecen en Google Drive.

Cada usuario puede cambiar su propia contraseña. Además, el administrador
puede restablecer cualquier cuenta, el encargado las cuentas de sus PDV y el
PDV las cuentas de sus repartidores. Un cambio o restablecimiento invalida las
sesiones anteriores de la cuenta afectada.
