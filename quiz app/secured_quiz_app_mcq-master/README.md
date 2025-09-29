# Welcome to mcq-quiz app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
    npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

This quiz app mainly designed to restrict the users from copying in the internet.
otherwise,its a normal quiz app with questions and choice-list.
Tech_stack:react-native
working:
there is a first page ,which has the start button for the test.
when the user clicks on the start button,call-back function is triggered which checks whether the user turns on the internet or not.if the internet is on,it ask to turn off to start.if the internet is on ,test will start.

when the test get started,there will be a question section,options section and prev,next buttons to navigate through questions in the main page.only the contents changes in the main page,when the next and prev buttons get clicked ,the contents of the question section,and its option section gets 
changed.

while attending the test ,if the user tries to switch apps or turn on the internet,the test will get stopped.

the user can attend the test only once.How i have implemented is that i stored flag in the local storage.if the user wants to attend the test again.they have uninstall and reinstall the app to attend the test again. 


