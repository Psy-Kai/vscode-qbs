import * as vscode from 'vscode';
import * as fs from 'fs';

import * as QbsUtils from './qbsutils';
import * as QbsConfig from './qbsconfig';
import {QbsProject} from './qbsproject';
import {QbsProduct} from './qbsproduct';
import {QbsSessionProtocol, QbsSessionProtocolStatus} from './qbssessionprotocol';
import {QbsSessionHelloResult,
        QbsSessionProcessResult,
        QbsSessionTaskStartedResult,
        QbsSessionTaskProgressResult,
        QbsSessionTaskMaxProgressResult,
        QbsSessionMessageResult} from './qbssessionresults';

export enum QbsSessionStatus {
    Stopped,
    Started,
    Stopping,
    Starting
}

export class QbsSession implements vscode.Disposable {
    private _protocol: QbsSessionProtocol = new QbsSessionProtocol();
    private _status: QbsSessionStatus = QbsSessionStatus.Stopped;
    private _project?: QbsProject;
    private _profileName: string = '';
    private _configurationName: string = '';
    private _runProduct: QbsProduct = QbsProduct.createEmptyProduct();
    private _buildProduct: QbsProduct = QbsProduct.createEmptyProduct();
    private _runEnvironment: any = {};
    private _debugger: any = {};

    private _onStatusChanged: vscode.EventEmitter<QbsSessionStatus> = new vscode.EventEmitter<QbsSessionStatus>();
    private _onProjectActivated: vscode.EventEmitter<QbsProject> = new vscode.EventEmitter<QbsProject>();
    private _onProfileNameChanged: vscode.EventEmitter<string> = new vscode.EventEmitter<string>();
    private _onConfigurationNameChanged: vscode.EventEmitter<string> = new vscode.EventEmitter<string>();
    private _onBuildProductChanged: vscode.EventEmitter<QbsProduct> = new vscode.EventEmitter<QbsProduct>();
    private _onRunProductChanged: vscode.EventEmitter<QbsProduct> = new vscode.EventEmitter<QbsProduct>();
    private _onDebuggerChanged: vscode.EventEmitter<any> = new vscode.EventEmitter<any>();

    private _onHelloReceived: vscode.EventEmitter<QbsSessionHelloResult> = new vscode.EventEmitter<QbsSessionHelloResult>();
    private _onProjectResolved: vscode.EventEmitter<QbsSessionMessageResult> = new vscode.EventEmitter<QbsSessionMessageResult>();
    private _onProjectBuilt: vscode.EventEmitter<QbsSessionMessageResult> = new vscode.EventEmitter<QbsSessionMessageResult>();
    private _onProjectCleaned: vscode.EventEmitter<QbsSessionMessageResult> = new vscode.EventEmitter<QbsSessionMessageResult>();
    private _onProjectInstalled: vscode.EventEmitter<QbsSessionMessageResult> = new vscode.EventEmitter<QbsSessionMessageResult>();
    private _onWarningMessageReceived: vscode.EventEmitter<QbsSessionMessageResult> = new vscode.EventEmitter<QbsSessionMessageResult>();
    private _onLogMessageReceived: vscode.EventEmitter<QbsSessionMessageResult> = new vscode.EventEmitter<QbsSessionMessageResult>();
    private _onTaskStarted: vscode.EventEmitter<QbsSessionTaskStartedResult> = new vscode.EventEmitter<QbsSessionTaskStartedResult>();
    private _onTaskProgressUpdated: vscode.EventEmitter<QbsSessionTaskProgressResult> = new vscode.EventEmitter<QbsSessionTaskProgressResult>();
    private _onTaskMaxProgressChanged: vscode.EventEmitter<QbsSessionTaskMaxProgressResult> = new vscode.EventEmitter<QbsSessionTaskMaxProgressResult>();
    private _onCommandDescriptionReceived: vscode.EventEmitter<QbsSessionMessageResult> = new vscode.EventEmitter<QbsSessionMessageResult>();
    private _onProcessResultReceived: vscode.EventEmitter<QbsSessionProcessResult> = new vscode.EventEmitter<QbsSessionProcessResult>();
    private _onRunEnvironmentResultReceived: vscode.EventEmitter<QbsSessionMessageResult> = new vscode.EventEmitter<QbsSessionMessageResult>();

    readonly onStatusChanged: vscode.Event<QbsSessionStatus> = this._onStatusChanged.event;
    readonly onProjectActivated: vscode.Event<QbsProject> = this._onProjectActivated.event;
    readonly onProfileNameChanged: vscode.Event<string> = this._onProfileNameChanged.event;
    readonly onConfigurationNameChanged: vscode.Event<string> = this._onConfigurationNameChanged.event;
    readonly onBuildProductChanged: vscode.Event<QbsProduct> = this._onBuildProductChanged.event;
    readonly onRunProductChanged: vscode.Event<QbsProduct> = this._onRunProductChanged.event;
    readonly onDebuggerChanged: vscode.Event<any> = this._onDebuggerChanged.event;

    readonly onHelloReceived: vscode.Event<QbsSessionHelloResult> = this._onHelloReceived.event;
    readonly onProjectResolved: vscode.Event<QbsSessionMessageResult> = this._onProjectResolved.event;
    readonly onProjectBuilt: vscode.Event<QbsSessionMessageResult> = this._onProjectBuilt.event;
    readonly onProjectCleaned: vscode.Event<QbsSessionMessageResult> = this._onProjectCleaned.event;
    readonly onProjectInstalled: vscode.Event<QbsSessionMessageResult> = this._onProjectInstalled.event;
    readonly onWarningMessageReceived: vscode.Event<QbsSessionMessageResult> = this._onWarningMessageReceived.event;
    readonly onLogMessageReceived: vscode.Event<QbsSessionMessageResult> = this._onLogMessageReceived.event;
    readonly onTaskStarted: vscode.Event<QbsSessionTaskStartedResult> = this._onTaskStarted.event;
    readonly onTaskProgressUpdated: vscode.Event<QbsSessionTaskProgressResult> = this._onTaskProgressUpdated.event;
    readonly onTaskMaxProgressChanged: vscode.Event<QbsSessionTaskMaxProgressResult> = this._onTaskMaxProgressChanged.event;
    readonly onCommandDescriptionReceived: vscode.Event<QbsSessionMessageResult> = this._onCommandDescriptionReceived.event;
    readonly onProcessResultReceived: vscode.Event<QbsSessionProcessResult> = this._onProcessResultReceived.event;
    readonly onRunEnvironmentResultReceived: vscode.Event<QbsSessionMessageResult> = this._onRunEnvironmentResultReceived.event;

    constructor() {
        this._protocol.onStatusChanged(status => {
            switch (status) {
            case QbsSessionProtocolStatus.Started:
                this.status = QbsSessionStatus.Started;
                break;
            case QbsSessionProtocolStatus.Starting:
                this.status = QbsSessionStatus.Starting;
                break;
            case QbsSessionProtocolStatus.Stopped:
                this.status = QbsSessionStatus.Stopped;
                break;
            case QbsSessionProtocolStatus.Stopping:
                this.status = QbsSessionStatus.Stopping;
                break;
            }
        });

        this._protocol.onResponseReceived(response => this.parseResponse(response));
    }

    dispose() {
        this._protocol?.dispose();
    }

    async start() {
        if (this._status === QbsSessionStatus.Stopped) {
            const qbsPath = QbsConfig.fetchQbsPath();
            if (qbsPath.length > 0) {
                await this._protocol.start(qbsPath);
            }
        }
    }

    async stop() {
        if (this._status === QbsSessionStatus.Started) {
            await this._protocol.stop();
        }
    }

    async resolve() {
        let request: any = {};
        request['type'] = 'resolve-project';
        request['environment'] = process.env;
        request['data-mode'] = 'only-if-changed';
        request['module-properties'] = [
            'cpp.compilerVersionMajor',
            'cpp.compilerVersionMinor',
            'cpp.compilerVersionPatch',
            'cpp.compilerIncludePaths',
            'cpp.distributionIncludePaths',
            'cpp.systemIncludePaths',
            'cpp.includePaths',
            'cpp.frameworkPaths',
            'cpp.systemFrameworkPaths',
            'cpp.compilerDefinesByLanguage',
            'cpp.defines',
            'cpp.compilerName',
            'cpp.compilerPath',
            'cpp.compilerPathByLanguage',
            'cpp.cLanguageVersion',
            'cpp.cxxLanguageVersion',
            'cpp.prefixHeaders',
            'qbs.architecture',
            'qbs.toolchain'
        ];

        request['project-file-path'] = this._project?.filePath();

        if (this._configurationName.length > 0) {
            request['configuration-name'] = this._configurationName;
        }

        if (this._profileName.length > 0) {
            request['top-level-profile'] = this._profileName;
        }

        const buildDirectory = QbsConfig.fetchQbsBuildDirectory();
        request['build-root'] = buildDirectory;
        // Do not store the build graph if the build directory does not exist yet.
        request['dry-run'] = !fs.existsSync(buildDirectory);

        const settingsDirectory = QbsConfig.fetchQbsSettingsDirectory();
        if (settingsDirectory.length > 0) {
            request['settings-directory'] = settingsDirectory;
        }

        const forceProbes = QbsConfig.fetchQbsForceProbes();
        request['force-probe-execution'] = forceProbes;

        const errorHandlingMode = QbsConfig.fetchQbsErrorHandlingMode();
        request['error-handling-mode'] = errorHandlingMode;

        const logLevel = QbsConfig.fetchQbsLogLevel();
        request['log-level'] = logLevel;

        await this._protocol.sendRequest(request);
    }

    async build() {
        let request: any = {};
        request['type'] = 'build-project';
        request['data-mode'] = 'only-if-changed';
        request['install'] = true;
        request['products'] = [this._buildProduct.fullDisplayName];

        const maxJobs = QbsConfig.fetchQbsMaxJobs();
        if (maxJobs > 0) {
            request['max-job-count'] = maxJobs;
        }

        const keepGoing = QbsConfig.fetchQbsKeepGoing();
        request['keep-going'] = keepGoing;

        const showCommandLines = QbsConfig.fetchQbsShowCommandLines();
        request['command-echo-mode'] = showCommandLines ? 'command-line' : 'summary';

        const logLevel = QbsConfig.fetchQbsLogLevel();
        request['log-level'] = logLevel;

        const cleanInstallRoot = QbsConfig.fetchQbsCleanInstallRoot();
        request['clean-install-root'] = cleanInstallRoot;

        await this._protocol.sendRequest(request);
    }

    async clean() {
        let request: any = {};
        request['type'] = 'clean-project';
        request['products'] = [this._buildProduct.fullDisplayName];

        const keepGoing = QbsConfig.fetchQbsKeepGoing();
        request['keep-going'] = keepGoing;

        const logLevel = QbsConfig.fetchQbsLogLevel();
        request['log-level'] = logLevel;

        await this._protocol.sendRequest(request);
    }

    async install() {
        let request: any = {};
        request['type'] = 'install-project';

        const keepGoing = QbsConfig.fetchQbsKeepGoing();
        request['keep-going'] = keepGoing;

        const logLevel = QbsConfig.fetchQbsLogLevel();
        request['log-level'] = logLevel;

        await this._protocol.sendRequest(request);
    }

    async cancel() {
        let request: any = {};
        request['type'] = 'cancel-job';

        await this._protocol.sendRequest(request);
    }

    async runEnvironment() {
        let request: any = {};
        request['type'] = 'get-run-environment';
        request['product'] = this._runProduct.fullDisplayName;

        await this._protocol.sendRequest(request);
    }

    fetchRunEnvironment(): any {
        return this._runEnvironment;
    }

    set status(st: QbsSessionStatus) {
        if (st !== this._status) {
            this._status = st;
            this._onStatusChanged.fire(this._status);
        }
    }

    get status(): QbsSessionStatus {
        return this._status;
    }

    setActiveProject(uri: vscode.Uri) {
        this._project = new QbsProject(uri);
        this._onProjectActivated.fire(this._project);
    }

    activeProject(): QbsProject | undefined {
        return this._project;
    }

    set profileName(name: string) {
        if (name !== this._profileName) {
            this._profileName = name;
            this._onProfileNameChanged.fire(this._profileName);
        }
    }

    get profileName(): string {
        return this._profileName;
    }

    set configurationName(name: string) {
        if (name !== this._configurationName) {
            this._configurationName = name;
            this._onConfigurationNameChanged.fire(this._configurationName);
        }
    }

    get configurationName(): string {
        return this._configurationName;
    }

    set buildProduct(product: QbsProduct) {
        if (product !== this._buildProduct) {
            this._buildProduct = product;
            this._onBuildProductChanged.fire(this._buildProduct);
        }
    }

    get buildProduct(): QbsProduct {
        return this._buildProduct;
    }

    set runProduct(product: QbsProduct) {
        if (product !== this._runProduct) {
            this._runProduct = product;
            this._onRunProductChanged.fire(this._runProduct);
        }
    }

    get runProduct(): QbsProduct {
        return this._runProduct;
    }

    set debugger(config: any) {
        if (config !== this._debugger) {
            this._debugger = config;
            this._onDebuggerChanged.fire(this._debugger);
        }
    }

    get debugger(): any {
        return this._debugger;
    }

    private parseResponse(response: any) {
        const type = response['type'];
        if (type === 'hello') {
            const result = new QbsSessionHelloResult(response)
            this._onHelloReceived.fire(result);
        } else if (type === 'project-resolved') {
            this._project?.setData(response, true);
            const result = new QbsSessionMessageResult(response['error']);
            this._onProjectResolved.fire(result);
        } else if (type === 'project-built' || type === 'build-done') {
            this._project?.setData(response, false);
            const result = new QbsSessionMessageResult(response['error']);
            this._onProjectBuilt.fire(result);
        } else if (type === 'project-cleaned') {
            const result = new QbsSessionMessageResult(response['error']);
            this._onProjectCleaned.fire(result);
        } else if (type === 'install-done') {
            const result = new QbsSessionMessageResult(response['error']);
            this._onProjectInstalled.fire(result);
        } else if (type === 'log-data') {
            const result = new QbsSessionMessageResult(response['message']);
            this._onLogMessageReceived.fire(result);
        } else if (type === 'warning') {
            const result = new QbsSessionMessageResult(response['warning']);
            this._onWarningMessageReceived.fire(result);
        } else if (type === 'task-started') {
            const result = new QbsSessionTaskStartedResult(response);
            this._onTaskStarted.fire(result);
        } else if (type === 'task-progress') {
            const result = new QbsSessionTaskProgressResult(response);
            this._onTaskProgressUpdated.fire(result);
        } else if (type === 'new-max-progress') {
            const result = new QbsSessionTaskMaxProgressResult(response);
            this._onTaskMaxProgressChanged.fire(result);
        } else if (type === 'generated-files-for-source') {
            // TODO: Implement me.
        } else if (type === 'command-description') {
            const result = new QbsSessionMessageResult(response['message']);
            this._onCommandDescriptionReceived.fire(result);
        } else if (type === 'files-added' || type === 'files-removed') {
            // TODO: Implement me.
        } else if (type === 'process-result') {
            const result = new QbsSessionProcessResult(response);
            this._onProcessResultReceived.fire(result);
        } else if (type === 'run-environment') {
            this.setRunEnvironment(response);
            const result = new QbsSessionMessageResult(response['error']);
            this._onRunEnvironmentResultReceived.fire(result);
        }
    }

    private setRunEnvironment(response: any) {
        this._runEnvironment = response['full-environment'] || {};
    }
}
