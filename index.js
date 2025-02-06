import { Octokit } from "@octokit/core";
import express from "express";
import { Readable } from "node:stream";
import { promises as fs } from "fs";
import path from "path";

const app = express();

app.get("/", (req, res) => {
  res.send("Welcome to Github Copilot Extension");
});

app.post("/", express.json(), async (req, res) => {
  try {
    // Identify the user, using the GitHub API token provided in the request headers.
    const tokenForUser = req.get("X-GitHub-Token");
    if (!tokenForUser) {
      res.status(401).send("Missing GitHub token");
      return;
    }
    const octokit = new Octokit({ auth: tokenForUser });
    const userResponse = await octokit.request("GET /user");
    console.log("User:", userResponse.data.login);

    // Parse the request payload and log it.
    const payload = req.body;
    console.log("Payload:", payload);

    // Read additional context from a local Markdown file.
    const markdownPath = path.resolve("./docs.md"); // Adjust the path if needed.
    let markdownContent = "";
    try {
      markdownContent = await fs.readFile(markdownPath, "utf8");
    } catch (error) {
      console.error("Error reading Markdown file:", error);
      // Optionally, you could choose to continue without the markdown or return an error.
    }

    // Insert a special system message including the Markdown content.
    // You can modify the message content as needed to instruct/enhance the LLM.
    const messages = payload.messages || [];
    messages.unshift({
      role: "system",
      content: `System prompt: Please take into account the following documentation context:\n\n${markdownContent}\n\nFeel free to leverage this context in your response.`
    });

    // Use Copilot's LLM to generate a response to the user's messages.
    const copilotLLMResponse = await fetch(
      "https://api.githubcopilot.com/chat/completions",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${tokenForUser}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messages,
          stream: true,
        }),
      }
    );

    // Check for errors in the Copilot API response.
    if (!copilotLLMResponse.ok) {
      const errorText = await copilotLLMResponse.text();
      console.error("Copilot API error:", errorText);
      res.status(500).send("Error from Copilot API");
      return;
    }

    // Stream the response straight back to the user.
    Readable.from(copilotLLMResponse.body).pipe(res);
  } catch (error) {
    console.error("Error in POST handler:", error);
    res.status(500).send("Internal Server Error");
  }
});

const port = Number(process.env.PORT || "3000");
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
