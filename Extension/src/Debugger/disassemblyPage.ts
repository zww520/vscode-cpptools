/*! -------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All Rights Reserved.
 * See 'LICENSE' in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
// import * as crypto from 'crypto';
import * as path from 'path';
import * as vscode from 'vscode';
import { CppdbgTrackerAdapterDescriptionFactor } from './trackerAdapterDescriptionFactory';
import * as debugProtocol from "vscode-debugProtocol";
// import * as resources from '../nativeStrings';

export class DisassemblyPage {
    public static currentPage?: DisassemblyPage;

    private readonly _panel: vscode.WebviewPanel;
    private readonly _disposables: vscode.Disposable[] = [];
    // private debugTracker: CppdbgTrackerAdapterDescriptionFactor;

    public static createOrShow(context: vscode.ExtensionContext, debugTracker: CppdbgTrackerAdapterDescriptionFactor): void {
        if (DisassemblyPage.currentPage) {
            DisassemblyPage.currentPage._panel.reveal();
            return;
        }

        const panel: vscode.WebviewPanel = vscode.window.createWebviewPanel('azuresphere.WelcomePage',
            '_Disassembly_Window_', vscode.ViewColumn.One,
            {
                enableScripts: true,
                enableCommandUris: true,
                localResourceRoots: [vscode.Uri.file(DisassemblyPage.getResourcesPath(context.extensionPath))]
            });
        DisassemblyPage.currentPage = new DisassemblyPage(panel, context.extensionPath, debugTracker);
    }

    private static getResourcesPath(extensionPath: string): string {
        return path.join(extensionPath, 'out', 'Extension', 'welcomePageResources');
    }

    private constructor(panel: vscode.WebviewPanel, extensionPath: string, debugTracker: CppdbgTrackerAdapterDescriptionFactor) {
        this._panel = panel;
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'iothubClicked': {
                    const tracker = debugTracker.getActiveDebugAdapterTracker();
                    if (tracker) {
                        tracker.sendDisassemblyRequestByFrame(0, 0, 0, 10).then(response => {
                            const instructions: debugProtocol.DebugProtocol.DisassembledInstruction[] = response.instructions;
                            // let msg = '';
                            // instructions.forEach(instr => msg += `${instr.address} | ${instr.instructionBytes} | ${instr.instruction} | ${instr.line} | ${instr.location}<br>`)
                            this._panel.webview.postMessage({ command: "print", instructions: instructions });
                        });
                    }
                    else {
                        this._panel.webview.postMessage({ command: "print" });
                    }
                    break;
                }
                case 'toggleStep':
                    {
                        const tracker = debugTracker.getActiveDebugAdapterTracker();
                        if (tracker) {
                            const newStep = !tracker.instructionStep;
                            tracker.instructionStep = newStep;
                            this._panel.webview.postMessage({ command: "toggleComplete", isInstructionStepping: newStep });
                        }

                        break;
                    }
            }
        }, null, this._disposables);

        /*
        const styleUri: vscode.Uri = vscode.Uri.file(path.join(DisassemblyPage.getResourcesPath(extensionPath), 'welcomePageStyle.css'));
        const scriptUri: vscode.Uri = vscode.Uri.file(path.join(DisassemblyPage.getResourcesPath(extensionPath), 'welcomePageScript.js'));

        const styleWebviewUri: vscode.Uri = panel.webview.asWebviewUri(styleUri);
        const scriptWebviewUri: vscode.Uri = panel.webview.asWebviewUri(scriptUri);
            <!--
    Use a content security policy to only allow scripts that have a specific nonce.
    -->
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
        */
        // const nonce: string = crypto.randomBytes(32).toString('hex');

        this._panel.webview.html =
            `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Disassembly Window</title>
</head>
<body>

<h1>Disassembly Window</h1>

<button type="button" id="iothub">Refresh</button>
<button type="button" id="stepToggle">Toggle Step: Unknown</button>
<table id="assemblyTable" >
  <thead>
    <tr>
        <th>BreakPoint</th>
        <th>Address</th>
        <th>Instructions</th>
    </tr>
  </thead>
</table>
<p id="assemblyResult" >::SCRIPT ERROR::</p>

<script>
    document.getElementById('assemblyResult').innerHTML = "Script Loading...";
    const stepToggleButton = document.getElementById('stepToggle');

    // Handle the message inside the webview
    window.addEventListener('message', event => {
        const message = event.data; // The JSON data our extension sent
        switch (message.command) {
            case 'print':
                if (message.instructions) {
                    let msg = "";
                    message.instructions.forEach(instr => {
                        msg += '<tr><input type="checkbox"><td>$\{instr.address\}</td><td>$\{instr.instruction\}</td><td>$\{instr.instructionBytes\}</td></tr>'
                    });
                    document.getElementById('assemblyTable').innerHTML = msg;
                }
                else
                    document.getElementById('assemblyResult').innerHTML = "Checked if debugger is active and breakpoint is hit.";
                break;
            case 'toggleComplete':
                stepToggleButton.innerHTML = 'Toggle Step: ' + (message.isInstructionStepping ? 'Instruction' : 'Source Code');
        }
    });

    const vscode = acquireVsCodeApi();
    function iothubClicked() {
      vscode.postMessage({ command: 'iothubClicked' });
      document.getElementById('assemblyResult').innerHTML = "Getting Data...";
    }

    function toggleIntructionStep() {
        vscode.postMessage({ command: 'toggleStep' });
    }

    stepToggleButton.onclick = toggleIntructionStep;

    const iothubElement = document.getElementById('iothub');
    iothubElement.onclick = iothubClicked;
    document.getElementById('assemblyResult').innerHTML = "Script Ready.";
    iothubClicked();
    toggleIntructionStep();
</script>
</body>
</html>`;
    }

    public dispose(): void {
        DisassemblyPage.currentPage = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}