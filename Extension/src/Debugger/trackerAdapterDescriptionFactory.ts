
import * as vscode from "vscode";

import * as debugProtocol from "vscode-debugProtocol";

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
    public instructionBP: debugProtocol.DebugProtocol.InstructionBreakpoint[] = [];

    constructor(private session: vscode.DebugSession) {
        this.state = DebugSessionState.Unknown;
    }
    removeDisassemblyBreakPoint(address: string, offset: number | undefined, condition: string | undefined, hitCondition: string | undefined): void {
        this.instructionBP.find((value, index) => {
            if (value.instructionReference == address) this.instructionBP.splice(index, 1);
        });
    }
    addDisassemblyBreakPoint(address: string, offset: number | undefined, condition: string | undefined, hitCondition: string | undefined): void {
        if (this.instructionBP.find(value => value.instructionReference == address)) {
            return;
        }

        const newInstructionBP: debugProtocol.DebugProtocol.InstructionBreakpoint = {
            instructionReference: address,
            offset: offset,
            condition: condition,
            hitCondition: hitCondition
        };

        this.instructionBP.push(newInstructionBP);
    }
    sendDisassemblyBreakPoint(address: string, offset: number | undefined, condition: string | undefined, hitCondition: string | undefined): Thenable<any> {
        const args: debugProtocol.DebugProtocol.SetInstructionBreakpointsArguments = {
            breakpoints: this.instructionBP
        };

        return this.session.customRequest("setInstructionBreakpoints", args);
    }
    /*
        frame: stackFrame
    */
    sendDisassemblyRequestByFrame(frame: number, offset: number, instructionOffset: number, instructionCount: number): Thenable<any> {
        if (this.state == DebugSessionState.Stopped) {
            if (!this.stackFrames || frame > this.stackFrames.length
                || !this.stackFrames[frame].instructionPointerReference) {
                return Promise.resolve();
            }

            const address: string = this.stackFrames[frame].instructionPointerReference!;

            return this.sendDisassemblyRequest(address, offset, instructionOffset, instructionCount);
        }
        return Promise.resolve();
    }
    /*
        address: Treated as a hex value if prefixed with '0x', or as a decimal value otherwise.
    */
    sendDisassemblyRequest(address: string, offset: number, instructionOffset: number, instructionCount: number): Thenable<any> {
        if (this.state == DebugSessionState.Stopped) {
            if (!address && this.stackFrames) {
                const fristFrame = this.stackFrames.find(frame => frame.instructionPointerReference)?.instructionPointerReference!;
                address = fristFrame;
            }

            const args: debugProtocol.DebugProtocol.DisassembleArguments = {
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
                                message.arguments.granularity = 'instruction';
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
        if (message) {
            console.log(message)
            switch (message.type) {
                case "event":
                    switch (message.event) {
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
                    switch (message.command) {
                        case "stackTrace": {
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

    getActiveDebugAdapterTracker(): CppDbgDebugAdapterTracker | undefined {
        return this.activeTracker;
    }
}