/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All Rights Reserved.
 * See 'LICENSE' in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from "vscode";
import * as util from '../common';
import * as path from 'path';
import * as os from 'os';
import * as nls from 'vscode-nls';
import * as debugProtocol from "vscode-debugProtocol";

nls.config({ messageFormat: nls.MessageFormat.bundle, bundleFormat: nls.BundleFormat.standalone })();
const localize: nls.LocalizeFunc = nls.loadMessageBundle();

// Registers DebugAdapterDescriptorFactory for `cppdbg` and `cppvsdbg`. If it is not ready, it will prompt a wait for the download dialog.
// NOTE: This file is not automatically tested.

abstract class AbstractDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
    protected readonly context: vscode.ExtensionContext;

    // This is important for the Mock Debugger since it can not use src/common
    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    abstract createDebugAdapterDescriptor(session: vscode.DebugSession, executable?: vscode.DebugAdapterExecutable): vscode.ProviderResult<vscode.DebugAdapterDescriptor>;
}

export class CppdbgDebugAdapterDescriptorFactory extends AbstractDebugAdapterDescriptorFactory {
    public static DEBUG_TYPE: string = "cppdbg";

    constructor(context: vscode.ExtensionContext) {
        super(context);
    }

    createDebugAdapterDescriptor(session: vscode.DebugSession, executable?: vscode.DebugAdapterExecutable): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        return util.isExtensionReady().then(ready => {
            if (ready) {
                let command: string = path.join(this.context.extensionPath, './debugAdapters/OpenDebugAD7');

                // Windows has the exe in debugAdapters/bin.
                if (os.platform() === 'win32') {
                    command = path.join(this.context.extensionPath, "./debugAdapters/bin/OpenDebugAD7.exe");
                }

                return new vscode.DebugAdapterExecutable(command, []);
            } else {
                throw new Error(util.extensionNotReadyString);
            }
        });
    }
}

export class CppvsdbgDebugAdapterDescriptorFactory extends AbstractDebugAdapterDescriptorFactory {
    public static DEBUG_TYPE: string = "cppvsdbg";

    constructor(context: vscode.ExtensionContext) {
        super(context);
    }

    createDebugAdapterDescriptor(session: vscode.DebugSession, executable?: vscode.DebugAdapterExecutable): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
        if (os.platform() !== 'win32') {
            vscode.window.showErrorMessage(localize("debugger.not.available", "Debugger type '{0}' is not avaliable for non-Windows machines.", "cppvsdbg"));
            return null;
        } else {
            return util.isExtensionReady().then(ready => {
                if (ready) {
                    return new vscode.DebugAdapterExecutable(
                        path.join(this.context.extensionPath, './debugAdapters/vsdbg/bin/vsdbg.exe'),
                        ['--interpreter=vscode']
                    );
                } else {
                    throw new Error(util.extensionNotReadyString);
                }
            });
        }
    }
}

enum DebugSessionState {
    Unknown,
    Started,
    Running,
    Stopped,
    Exited
}

export class CppDbgDebugAdapterTracker implements vscode.DebugAdapterTracker {
    private state: DebugSessionState;
    private stackFrames: debugProtocol.DebugProtocol.StackFrame[] | undefined = undefined;

    constructor(private session: vscode.DebugSession) {
        this.state = DebugSessionState.Unknown;
    }

    /*
        frame: stackFrame
    */
    sendDisassemblyRequestByFrame(frame: number, offset: number, instructionOffset: number, instructionCount: number): Thenable<any> {
        if (this.state == DebugSessionState.Stopped)
        {
            if (!this.stackFrames || frame > this.stackFrames.length
                || !this.stackFrames[frame].instructionPointerReference) {
                return Promise.resolve();
            }

            const address:string = this.stackFrames[frame].instructionPointerReference!;

            return this.sendDisassemblyRequest(address, offset, instructionOffset, instructionCount);
        }
        return Promise.resolve();
    }
    /*
        address: Treated as a hex value if prefixed with '0x', or as a decimal value otherwise.
    */
    sendDisassemblyRequest(address: string, offset: number, instructionOffset: number, instructionCount: number): Thenable<any> {
        if (this.state == DebugSessionState.Stopped)
        {
            if (!address && this.stackFrames) {
                const fristFrame = this.stackFrames.find(frame => frame.instructionPointerReference)?.instructionPointerReference!;
                address = fristFrame;
            }

            const args:debugProtocol.DebugProtocol.DisassembleArguments = {
                memoryReference: address,
                offset: offset,
                instructionOffset: instructionOffset,
                instructionCount: instructionCount,
                resolveSymbols: true,
            };

            return this.session.customRequest("disassemble", args);

        }
        return Promise.resolve();
    }
    /**
     * A session with the debug adapter is about to be started.
     */
     onWillStartSession?(): void {
        this.state = DebugSessionState.Started;
    }
    /**
     * The debug adapter is about to receive a Debug Adapter Protocol message from VS Code.
     */
    onWillReceiveMessage?(message: any): void {
        if (message) {
            console.log(message)
            switch (message.type) {
                case 'request': {
                    switch (message.command) {
                        case 'stepBack':
                        case 'stepOut':
                        case 'stepIn':
                        case 'next': {
                            if (vscode.window.activeTextEditor?.document.fileName == "") {
                                message.arguments.granularity='instruction';
                            }
                            break;
                        }
                    }
                    break;
                }
                default:
                    break;
            }
        }
    }
    /**
     * The debug adapter has sent a Debug Adapter Protocol message to VS Code.
     */
    onDidSendMessage?(message: any): void {
        if (message)
        {
            console.log(message)
            switch (message.type)
            {
                case "event":
                    switch(message.event)
                    {
                        case "stopped":
                            this.state = DebugSessionState.Stopped;
                            break;
                        case "continued":
                            this.state = DebugSessionState.Running;
                            break;
                        default:
                            break;
                    }
                case "response":
                    switch(message.command) {
                        case "stackTrace":{
                            let _message: debugProtocol.DebugProtocol.StackTraceResponse = message;
                            this.stackFrames = _message.body.stackFrames;
                            break;
                        }
                        default:
                            break;
                    }

                default:
                    break;
            }
        }
    }
    /**
     * The debug adapter session is about to be stopped.
     */
    onWillStopSession?(): void {
        console.log("Stopping!")
    }
    /**
     * An error with the debug adapter has occurred.
     */
    onError?(error: Error): void {
        console.log("Errored!")
    }
    /**
     * The debug adapter has exited with the given exit code or signal.
     */
    onExit?(code: number | undefined, signal: string | undefined): void {
        console.log("Exiting!")
    }
}

export class CppdbgTrackerAdapterDescriptionFactor implements vscode.DebugAdapterTrackerFactory {
    public static DEBUG_TYPE_VS: string = "cppvsdbg";
    public static DEBUG_TYPE: string = "cppdbg";
    protected readonly context: vscode.ExtensionContext;
    private activeTracker: CppDbgDebugAdapterTracker | undefined;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    createDebugAdapterTracker(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterTracker> {
        this.activeTracker = new CppDbgDebugAdapterTracker(session);
        return this.activeTracker;
    }

    getActiveDebugAdapterTracker(): CppDbgDebugAdapterTracker | undefined
    {
        return this.activeTracker;
    }
}