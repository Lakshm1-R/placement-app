import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, TouchableOpacity, Button, StyleSheet, Alert, 
  AppState, BackHandler, ScrollView, Dimensions,TextInput,Image
} from 'react-native';
import { Picker } from '@react-native-picker/picker';

import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import originalQuestions from "./Questions";
import * as FileSystem from 'expo-file-system';

import generatePasscode  from "./Passcode";



// Function to shuffle array
const shuffleArray = (array) => {
  let shuffled = [...array]; // Create a copy of the array
  for (let i = shuffled.length - 1; i > 0; i--) {
    let j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};


export default function QuizApp() {
  const [screen, setScreen] = useState('home');
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [score, setScore] = useState(0);
  const [internetAccess, setInternetAccess] = useState(false);
  const [answers, setAnswers] = useState({});
   const [nameInput, setNameInput] = useState('');
  const [registerInput, setRegisterInput] = useState('');
  const [deptInput, setDeptInput] = useState('');
  const [yearInput, setYearInput] = useState('');
  const [userDetails, setUserDetails] = useState({
    name: '',
    register_number: '',
    department: '',
    year: '',
  });
  const [isNameGot, setIsNameGot] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [issubmitted, setIsubmitted] = useState(false);
  const [passcodeInput,setPasscodeInput] = useState("");
  const [quizName, setQuizName] = useState(null);



  let test = "Apti";
 
const [questions, setQuestions] = useState([]); // Initialize empty
/*
useEffect(() => {
  setQuestions(shuffleArray(originalQuestions)); // Shuffle on mount
}, []);
*/


const [attempted, setAttempted] = useState(false);





  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const handleAppStateChange = (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === "active" && screen === "quiz") {
        setScreen("result");
      } else if (appState.current === "active" && nextAppState.match(/inactive|background/) && screen === "quiz") {
        setScreen("result");
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [screen]);

  useEffect(() => {
    NetInfo.fetch().then((state) => {
      setInternetAccess(state.isConnected);
    });

    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        setInternetAccess(true);
        if (screen === 'quiz') {
          Alert.alert("Internet Detected", "Test ended due to internet access.", [
            { text: "OK", onPress: () => setScreen('result') }
          ]);
        }
      } else {
        setInternetAccess(false);
      }
    });

    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (screen === "quiz") {
        Alert.alert("Warning", "You cannot leave the quiz!", [{ text: "OK" }]);
        return true;
      }
      return false;
    });

    return () => {
      unsubscribeNetInfo();
      backHandler.remove();
    };
  }, [screen]);

  const handleStart = () => {
    if (!internetAccess) {
      setScreen('quiz');
    } else {
      Alert.alert("Turn Off Internet", "Please disable the internet to start the quiz.");
    }
  };

   const handleOptionSelect = (option) => {
    setSelectedOption(option);
    setAnswers({ ...answers, [currentQuestion]: option });
  };

  const handleNext = () => {
    const updatedAnswers = { ...answers, [currentQuestion]: selectedOption };
    setAnswers(updatedAnswers);

    if (currentQuestion + 1 < questions.length) {
      setCurrentQuestion(currentQuestion + 1);
      setSelectedOption(updatedAnswers[currentQuestion + 1] || null);
    } else {
      let finalScore = 0;
      questions.forEach((q, index) => {
        if (updatedAnswers[index] === q.answer) {
          finalScore++;
        }
      });
      setScore(finalScore);
      setScreen('result');
      
    }
  };

  const handlePrev = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
      setSelectedOption(answers[currentQuestion - 1] || null);
    }
  };


  const downloadImageAndReplaceLink = async (url, index) => {
  try {
    const filename = `image_${index}.jpg`;
    const localUri = `${FileSystem.documentDirectory}${filename}`;

    // Check if file already exists to avoid re-downloading
    const fileInfo = await FileSystem.getInfoAsync(localUri);
    if (!fileInfo.exists) {
      await FileSystem.downloadAsync(url, localUri);
    }

    return localUri;
  } catch (error) {
    console.warn(`Failed to download image ${url}:`, error);
    return ''; // fallback to empty string if failed
  }
};
// Function to fetch quiz questions based on department
const fetchQuizData = async (department) => {
  try {
    // Make API call to fetch quiz data based on the department (legacy)
    const response = await fetch(`https://placement-app-kg7c.onrender.com/quiz/${department}`);
    const data = await response.json();

    // Handle the response data (quiz data)
    if (data.error) {
      console.error('Error fetching quiz data:', data.error);
    } else {
      console.log('Fetched Quiz Data:', data);
      // Here you can set the questions in state or navigate to the quiz screen
      // Loop over questions and download images (if present)
    const updatedQuestions = await Promise.all(
      data.questions.map(async (q, index) => {
        if (q.image && q.image !== '') {
          const localPath = await downloadImageAndReplaceLink(q.image, index);
          return { ...q, image: localPath };
        }
        return { ...q, image: '' }; // no image
      })
    );
     setQuestions(shuffleArray(updatedQuestions));

    }
  } catch (error) {
    console.error('Error fetching quiz data:', error);
  }
};

// Load questions when launched from placement app with ?quiz=<tabName>
useEffect(() => {
  try {
    const qp = (typeof window !== 'undefined') ? new URLSearchParams(window.location.search) : null;
    const q = qp ? qp.get('quiz') : null;
    if (q) {
      setQuizName(q);
      (async () => {
        try {
          const resp = await fetch(`https://placement-app-kg7c.onrender.com/quiz/${encodeURIComponent(q)}`);
          const data = await resp.json();
          const updatedQuestions = await Promise.all(
            (data.questions || []).map(async (qu, index) => {
              if (qu.image && qu.image !== '') {
                const localPath = await downloadImageAndReplaceLink(qu.image, index);
                return { ...qu, image: localPath };
              }
              return { ...qu, image: '' };
            })
          );
          setQuestions(shuffleArray(updatedQuestions));
        } catch (e) {
          console.error('Failed to load quiz by name:', e);
        }
      })();
    }
  } catch (e) {
    // ignore
  }
}, []);
  const handleSubmit = async () => {
     if (
            nameInput.trim() !== '' &&
            registerInput.trim() !== '' &&
            (quizName ? true : deptInput !== '') &&
       yearInput.trim() !== '' &&
       passcodeInput.trim() !==''
     ) {
       
       //check the passcode to enter the test.
      
       const currentValidPasscode = generatePasscode();
        
       console.log(currentValidPasscode);
  if (passcodeInput.trim() !== currentValidPasscode) {
    Alert.alert("Invalid Passcode", "Please enter the correct passcode.");
    return;
  }

          //  First check if the register number already exists
      const response = await fetch('https://placement-app-kg7c.onrender.com/submitted-registers');
      const data = await response.json();

      if (data?.registerNumbers?.includes(registerInput.trim())) {
        Alert.alert('Already Attempted', 'You have already attended the test.');
        return; //  Stop further execution
      }
       Alert.alert('Questions Loading', 'Wait for few mins');
       if (quizName) {
         // Already loaded by name in useEffect; if not yet, try again quick
         if (!questions || questions.length === 0) {
           try {
             const resp = await fetch(`https://placement-app-kg7c.onrender.com/quiz/${encodeURIComponent(quizName)}`);
             const data2 = await resp.json();
             const updatedQuestions = await Promise.all(
               (data2.questions || []).map(async (qu, index) => {
                 if (qu.image && qu.image !== '') {
                   const localPath = await downloadImageAndReplaceLink(qu.image, index);
                   return { ...qu, image: localPath };
                 }
                 return { ...qu, image: '' };
               })
             );
             setQuestions(shuffleArray(updatedQuestions));
           } catch (e) {}
         }
       } else {
         await fetchQuizData(deptInput);
       }

      setUserDetails({
        name: nameInput,
        register_number: registerInput,
        department: deptInput,
        year: yearInput,
      });
      setIsNameGot(true);
          } else {
            Alert.alert('Missing Info', 'Please fill out all the fields.');
          }
  }

  // Calculate the number of questions answered
  const numQuestionsAnswered = Object.keys(answers).length;

  const handleSubmitt = async () => {
    if (!internetAccess) {
      Alert.alert("No Internet", "Please turn on the internet to submit your results.");
      return;
    }

    setIsSubmitting(true);
    //here we can calculate the scoress
    //  Recalculate score from `answers` state
  let finalScore = 0;
  Object.entries(answers).forEach(([key, selected]) => {
    const questionIndex = parseInt(key); // keys are string
    if (questions[questionIndex]?.answer === selected) {
      finalScore++;
    }
  });
  setScore(finalScore); // Update score state

    try {
      const response = await fetch('https://placement-app-kg7c.onrender.com/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: userDetails.name,
          register_number: userDetails.register_number,
          score: finalScore,
          department: userDetails.department || quizName || '',
          year: userDetails.year,
        }),
      });

      if (response.ok) {
        // If the score was successfully submitted
        Alert.alert('Success', 'Your score has been submitted successfully!');
        
        // Clear form or reset state after submission
        // You can reset the user details and score if needed
        setIsSubmitting(false);  // Reset submitting state
        setIsubmitted(true);
        // Also inform placement backend to mark as completed (simple webhook)
        try {
          // Try primary endpoint
          let ok = false;
          try {
            const r1 = await fetch('https://placement-app-1-uczm.onrender.com/api/prep/webhooks/quiz/submission-simple', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                quizTitle: quizName || (userDetails.department || ''),
                registerNo: userDetails.register_number,
                score: finalScore,
                total: questions.length
              })
            });
            ok = r1.ok;
          } catch (e) {}
          // Fallback alias
          if (!ok) {
            try {
              const r2 = await fetch('https://placement-app-1-uczm.onrender.com/api/prep/webhooks/submission-simple', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              quizTitle: quizName || (userDetails.department || ''),
              registerNo: userDetails.register_number,
              score: finalScore,
              total: questions.length
                })
              });
              ok = r2.ok;
            } catch (e) {}
          }
          // Ultimate fallback: GET ping to warm up then retry primary once
          if (!ok) {
            try { await fetch('https://placement-app-1-uczm.onrender.com/api/prep/webhooks/ping'); } catch (e) {}
            try {
              await fetch('https://placement-app-1-uczm.onrender.com/api/prep/webhooks/quiz/submission-simple', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  quizTitle: quizName || (userDetails.department || ''),
                  registerNo: userDetails.register_number,
                  score: finalScore,
                  total: questions.length
                })
              });
            } catch (e) {}
          }
        } catch (e) {
          // ignore
        }
        // Reset user details if necessary
        // setUserDetails({ name: '', register_number: '', department: '', year: '' });
        // Reset score if necessary
        // setScore(0);
        // Clear answers if needed
        // setAnswers({});
      } else {
        // If there was an issue with the submission
        Alert.alert('Error', 'Failed to submit your score. Please try again.');
      }
    } catch (error) {
      console.error('Error submitting the results:', error);
      Alert.alert('Error', 'An error occurred. Please try again.');
      setIsSubmitting(false);  // Reset submitting state
    }
  };
  return (
    <View style={styles.container}>
      {screen === 'home' && isNameGot && (
        <>
          {internetAccess && <Text style={styles.warning}>Turn off the internet to continue.</Text>}
          <Button title="Start Quiz" onPress={handleStart} />
        </>
      )}

      {//this screen is for getting the details and loading the questions
        screen === 'home' && !isNameGot && (
  <View style={styles.formContainer}>
      <Text style={styles.label}>Enter Your Name:</Text>
      <TextInput
        style={styles.input}
        value={nameInput}
        onChangeText={setNameInput}
        placeholder="Your Name"
      />

      <Text style={styles.label}>Enter Your Register Number:</Text>
      <TextInput
        style={styles.input}
        value={registerInput}
        onChangeText={setRegisterInput}
        placeholder="Your Register Number"
      />

      <Text style={styles.label}>Select Your Department:</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={deptInput}
          onValueChange={(itemValue) => setDeptInput(itemValue)}
        >
          <Picker.Item label="Select Department" value="" />
          <Picker.Item label="CSE" value="cse" />
          <Picker.Item label="IT" value="it" />
          <Picker.Item label="ECE" value="ece" />
          
          <Picker.Item label="MECH" value="mech" />
          <Picker.Item label="PROD" value="prod" />
          <Picker.Item label="IBT" value="ibt" />
                <Picker.Item label="EEE" value="eee" />
                <Picker.Item label="CIVIL" value="civil" />
        </Picker>
      </View>

      <Text style={styles.label}>Enter Your Year:</Text>
      <TextInput
        style={styles.input}
        value={yearInput}
        onChangeText={setYearInput}
        placeholder="Your Year"
            />
            
            <Text style={styles.label}>Enter Passcode:</Text>
            <TextInput
              style={styles.input}
              value={passcodeInput}
              onChangeText={setPasscodeInput}
              placeholder="Enter Passcode"
            />


      <Button
        title="Start Test"
        onPress={handleSubmit}
      />
    </View>
)}
      
      {screen === 'quiz' && (

        <View style={styles.quizContainer}>
          {/* Question Section (60% height, scrollable if needed) */}
          
               <ScrollView style={styles.questionContainer}>
                       <Text style={styles.question}>
                         {`${currentQuestion + 1}. ${questions[currentQuestion].question}`}
                       </Text>

                 {questions[currentQuestion].image !== '' && (
                   <Image
                     source={{ uri: questions[currentQuestion].image }}
                     style={styles.questionImage}
                     resizeMode="contain"
                   />
                 )}
               </ScrollView>

          {/* Options Section (35% height, fits within block) */}
          <View style={styles.optionsContainer}>
            {questions[currentQuestion].options.map((option, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.option, selectedOption === option && styles.selectedOption]}
                onPress={() => handleOptionSelect(option)}
              >
                <Text style={styles.optionText} numberOfLines={3} adjustsFontSizeToFit>
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Next Button (5% height) */}
          <View style={styles.buttonContainer}>
            {currentQuestion != 0 && <Button title="Prev" onPress={handlePrev} />}
            <Button title={currentQuestion===(questions.length-1)?"Submit ":"Next"} onPress={handleNext} disabled={!selectedOption} />
          </View>
        </View>
      )}

      {screen === 'result' &&    <View style={styles.resultContainer}>
      <Text style={styles.result}>Name: {userDetails.name}</Text>
      <Text style={styles.result}>Department: {userDetails.department}</Text>
        {//<Text style={styles.result}>Your Score : {score}</Text>
        }
      <Text style={styles.result}>Number of Questions Answered: {numQuestionsAnswered}</Text>

      {!internetAccess && (
        <Text style={styles.warningText}>Please turn on the internet to submit your results.</Text>
      )}

      {internetAccess && !isSubmitting && !issubmitted &&(
        <Button
          title="Submit"
          onPress={handleSubmitt}
          disabled={isSubmitting}
        />
        )}
        {
          issubmitted && <Text style={styles.result}>Thank you for attending the test</Text>
        }

      {isSubmitting && (
        <Text style={styles.result}>Submitting...</Text>
      )}
    </View>}
    </View>
  );
}


const { height, width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center',
    paddingVertical: height * 0.05,  // 5% top padding
  },

  quizContainer: { 
    flex: 1, 
    width: '90%', 
    justifyContent: 'center',
  },

  questionContainer: { 
    maxHeight: height * 0.5, // 50% of screen height
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 10,
  },

  question: { 
    fontSize: 18, 
    fontWeight: 'bold', 
    textAlign: 'center', 
    paddingBottom:40
  },

  optionsContainer: { 
    height: height * 0.40, // 35% of screen height
    justifyContent: 'center',
  },

  option: { 
    //padding: 1, 
    height:60,
    marginVertical: 5, 
    backgroundColor: '#ccc', 
    borderRadius: 5, 
    alignItems: 'center',
    justifyContent: 'center',
  },

  selectedOption: { 
    backgroundColor: 'lightblue',
  },

  optionText: { 
    fontSize: 18, 
    textAlign: 'center',
  },

  buttonContainer: { 
    
    flexDirection: "row", 
    justifyContent: 'center',
    columnGap:30,
    alignItems: 'center',
    marginTop: 10,
  },

  result: { 
    fontSize: 22, 
    fontWeight: 'bold', 
    marginTop: 20,
    textAlign: 'center',
  },

  warning: { 
    fontSize: 16, 
    color: 'red', 
    marginBottom: 10, 
    textAlign: 'center',
  },
  formContainer: {
    padding: 20,
  },
  label: {
    fontSize: 16,
    marginVertical: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#aaa',
    borderRadius: 5,
    padding: 10,
    marginBottom: 15,
  },
  resultContainer: {
    padding: 20,
    alignItems: 'center',
  },
  result: {
    fontSize: 18,
    marginVertical: 5,
  },
  resultContainer: {
    padding: 20,
    marginTop: 20,
  },
  result: {
    fontSize: 18,
    marginBottom: 10,
  },
  warningText: {
    color: 'red',
    marginBottom: 20,
  },
  questionImage: {
  width: '100%',
  height: 200,
  marginTop: 10,
  borderRadius: 10,
},

});

