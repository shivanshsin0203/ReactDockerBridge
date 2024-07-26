const express = require("express");
const getDirectoryTree = require("./tree");
const path = require("path");
const fs = require('fs').promises;
const { exec } = require('child_process');
const kill = require('tree-kill'); 

let childProcess = null;

module.exports = function initHttp(app) {
    app.use(express.json());

    app.post("/project", async (req, res) => {
        const { replId, language } = req.body;
        res.send("Container created successfully! for replId: " + replId + " and language: " + language);
    });

    app.get("/filetree", async (req, res) => {
        const directory = getDirectoryTree(path.join(__dirname, "user"));
        res.json(directory);
    });

    app.get('/filecontent', async (req, res) => {
        try {
            const content = await fs.readFile(req.query.path, 'utf-8');
            return res.json({ content });
        } catch (error) {
            console.error('Error reading file:', error);
            res.status(500).json({ error: 'Failed to read file' });
        }
    });

    app.post('/run', async (req, res) => {
        const userDir = path.resolve(__dirname, "user");
    
        if (childProcess) {
            return res.status(400).send('Code is already running');
        }
    
        childProcess = exec('npm install && npm run dev', { cwd: userDir });
    
        console.log(`Child process started ${childProcess.pid}`);
        let responseSent = false;
    
        const sendResponse = (status, message) => {
            if (!responseSent) {
                res.status(status).json(message);
                responseSent = true;
            }
        };
    
        sendResponse(200, { message: 'Code is running' });
    
        childProcess.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
            const match = data.match(/Local:\s+http:\/\/localhost:(\d+)/);
            if (match) {
                const port = match[1];
                console.log(`Vite server started on port: ${port}`);
            }
        });
    
        childProcess.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
        });
    
        childProcess.on('error', (error) => {
            console.error(`exec error: ${error}`);
            childProcess = null;
            sendResponse(500, 'Error running code');
        });
    
        childProcess.on('exit', (code, signal) => {
            console.log(`child process exited with code ${code} and signal ${signal}`);
            childProcess = null;
            if (!responseSent) {
                sendResponse(500, 'Child process exited unexpectedly');
            }
        });
    });
    
    

    app.post('/stop', (req, res) => {
        if (childProcess) {
            console.log('Terminating child process', childProcess.pid);
    
            // Send the response immediately before killing the process
            res.send('Process terminated');
    
            // Store the PID for logging before killing the process
            const pid = childProcess.pid;
    
            // Use tree-kill to terminate the process and all subprocesses
            kill(pid, 'SIGTERM', (err) => {
                if (err) {
                    console.error(`Failed to kill process ${pid}:`, err);
                } else {
                    console.log(`Process ${pid} terminated`);
                    childProcess = null;
                }
            });
    
        } else {
            console.log('No process running to terminate');
            res.status(400).send('No process running');
        }
    });
    

    app.use('/live', express.static(path.join(__dirname, 'user')));
};
