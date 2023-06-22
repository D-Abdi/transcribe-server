import path from "path";
import {fileURLToPath} from "url";
import 'dotenv/config'
import express from "express";
import {createServer} from "http";
import {Server} from "socket.io";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.static("public/"));
app.get("/", function (req, res) {
    res.sendFile(__dirname + "/index.html");
});
const httpServer = createServer(app);

import pkg from "@deepgram/sdk";

const {Deepgram} = pkg;
let deepgram;
let dgLiveObj;
let io;
// make socket global so we can access it from anywhere
let globalSocket;

// Pull out connection logic so we can call it outside of the socket connection event
const initDgConnection = (disconnect) => {
    dgLiveObj = createNewDeepgramLive(deepgram);
    addDeepgramTranscriptListener(dgLiveObj);
    addDeepgramOpenListener(dgLiveObj);
    addDeepgramCloseListener(dgLiveObj);
    addDeepgramErrorListener(dgLiveObj);
    // clear event listeners
    if (disconnect) {
        globalSocket.removeAllListeners();
    }
    // receive data from client and send to dgLive
    globalSocket.on("packet-sent", async (event) =>
        dgPacketResponse(event, dgLiveObj)
    );

    // Clear the Deepgram live connection when the client disconnects
    globalSocket.on("disconnect", async (event) => {
        dgLiveObj.finish();
    })
};

/**
 * Create a websocket connection to the client
 * Set globalSocket to the socket that is created
 * Create a new Deepgram object
 * Initialize the Deepgram connection
 */
const createWebsocket = () => {
    io = new Server(httpServer, {transports: "websocket"});

    io.on("connection", (socket) => {
        console.log(`Connected on server side with ID: ${socket.id}`);
        globalSocket = socket;
        deepgram = createNewDeepgram();
        initDgConnection(false);
    });
};

/**
 * Create a new Deepgram object
 * @returns {Deepgram}
 */
const createNewDeepgram = () => {
    return new Deepgram("42ae5122e971dc797c582edaf88bc43f05e5826e");
}

/**
 * Create a new Deepgram live object
 * @param dg
 * @returns {WebSocket}
 */
const createNewDeepgramLive = (dg) => {
    return dg.transcription.live({
        language: "en",
        punctuate: true,
        smart_format: true,
        model: "nova",
    });
}

/**
 * Add a listener to the Deepgram live object
 * When a transcript is received, send it to the client
 * Log the transcript to the console
 * @param dg
 */
const addDeepgramTranscriptListener = (dg) => {
    dg.addListener("transcriptReceived", async (dgOutput) => {
        let dgJSON = JSON.parse(dgOutput);
        let utterance;
        try {
            utterance = dgJSON.channel.alternatives[0].transcript;
        } catch (error) {
            console.log(
                "WARNING: parsing dgJSON failed. Response from dgLive is:",
                error
            );
            console.log(dgJSON);
        }
        if (utterance) {
            globalSocket.emit("print-transcript", utterance);
            console.log(`NEW UTTERANCE: ${utterance}`);
        }
    });
};

/**
 * Listen for the Deepgram live object to open
 * @param dg
 */
const addDeepgramOpenListener = (dg) => {
    dg.addListener("open", async (msg) =>
        console.log(`dgLive WEBSOCKET CONNECTION OPEN!`)
    );
};

/**
 * Listen for the Deepgram live object to close
 * @param dg
 */
const addDeepgramCloseListener = (dg) => {
    dg.addListener("close", async (msg) => {
        console.log(`dgLive CONNECTION CLOSED!`);
    });
};

/**
 * Listen for the Deepgram live object to throw an error
 * @param dg
 */
const addDeepgramErrorListener = (dg) => {
    dg.addListener("error", async (msg) => {
        console.log("ERROR MESG", msg);
        console.log(`dgLive ERROR::Type:${msg.type} / Code:${msg.code}`);
        globalSocket.emit("error")
    });
};

/**
 * Send a packet to the Deepgram live object
 * @param event
 * @param dg
 */
const dgPacketResponse = (event, dg) => {
    if (dg.getReadyState() === 1) {
        dg.send(event);
    }
};

httpServer.listen(3000);
createWebsocket();
