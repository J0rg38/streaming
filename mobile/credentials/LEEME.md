# Firma de los APK — NO SUBIR A GIT, NO PERDER

Esta carpeta contiene el almacén de claves con el que se firman los APK de
release compilados en este PC (sin EAS).

```
mivod-release.keystore   el almacén (alias: mivod)
.keystore-password       la contraseña, en texto plano
```

Ambos están en `.gitignore`. **Haz una copia de seguridad fuera del ordenador**
(un pendrive, tu gestor de contraseñas, donde sea).

## Por qué importa no perderlo

Android identifica una app por *paquete + firma*. Si mañana compilas una versión
nueva con OTRO keystore, el sistema la considerará una app distinta y **se negará
a instalarla encima** de la que ya tengas: habría que desinstalar la anterior en
cada televisor y cada móvil, perdiendo la sesión y las descargas offline de todos.

Con este mismo keystore, en cambio, las actualizaciones se instalan encima sin
tocar los datos.

## Cómo se usa

Los scripts de compilación (`scripts/build-apk.mjs`) leen estos dos archivos y se
los pasan a Gradle. No hace falta tocar `android/build.gradle`, que además se
regenera en cada `expo prebuild` y perdería cualquier cambio manual.
