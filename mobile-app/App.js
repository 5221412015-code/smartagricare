import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";

const BACKEND_URL = "PASTE-YOUR-5000-URL-HERE";

export default function App() {
  const [message, setMessage] = useState("Loading...");

  useEffect(() => {
    fetch(BACKEND_URL)
      .then((res) => res.json())
      .then((data) => setMessage(data.message))
      .catch((err) => setMessage("ERROR: " + err.message));
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>{message}</Text>
      <Text style={styles.url}>{BACKEND_URL}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    fontSize: 20,
    marginBottom: 20,
  },
  url: {
    fontSize: 12,
    color: "gray",
  },
});
