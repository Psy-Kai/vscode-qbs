import * as vscode from 'vscode';
import { basename } from 'path';

// From user code.
import * as QbsUtils from './qbsutils';

export async function selectProject(): Promise<vscode.Uri | undefined> {
    interface ProjectQuickPickItem extends vscode.QuickPickItem {
        uri: vscode.Uri;
    }
    const projects = await QbsUtils.enumerateProjects();
    const items: ProjectQuickPickItem[] = projects.map(project => {
        return {
            label: basename(project.fsPath),
            uri: project
        };
    });
    return await vscode.window.showQuickPick(items).then(item => {
        return item ? item.uri : undefined;
    });
}

export async function selectProfile(): Promise<string | undefined> {
    const profiles = await QbsUtils.enumerateBuildProfiles();
    const items: vscode.QuickPickItem[] = profiles.map(profile => {
        return { label: profile };
    });
    return await vscode.window.showQuickPick(items).then(item => {
        return item ? item.label : undefined;
    });
}

export async function selectConfiguration(): Promise<string | undefined> {
    const configurations = await QbsUtils.enumerateBuildConfigurations();
    const items: vscode.QuickPickItem[] = configurations.map(configuration => {
        return { label: configuration };
    });
    return await vscode.window.showQuickPick(items).then(item => {
        return item ? item.label : undefined;
    });
}
