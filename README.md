# Tale

Tale bruker samme webkode som grunnlag for nettleser, Android og iPhone.

## Mobilapp

Installer avhengigheter og synkroniser webkoden:

```bash
npm install
npm run sync
```

Åpne Android-prosjektet i Android Studio:

```bash
npm run android
```

Åpne iOS-prosjektet i Xcode på macOS:

```bash
npm run ios
```

Android krever Android Studio og Android SDK. iOS krever macOS, Xcode og en Apple-utviklerkonto for publisering.

## Profilbilder

Publiser `firestore.rules` i Firebase Console under Firestore Database → Rules, og `storage.rules` under Storage → Rules. Profilbilder kan først lastes opp fra adminpanelet når begge regelsettene er publisert.