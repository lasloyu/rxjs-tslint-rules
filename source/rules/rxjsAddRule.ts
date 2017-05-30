/**
 * @license Copyright © 2017 Nicholas Jamieson. All Rights Reserved.
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/cartant/rxjs-tslint-rules
 */
/*tslint:disable:no-use-before-declare*/

import * as Lint from "tslint";
import * as path from "path";
import * as ts from "typescript";

import { AddedWalker } from "../support/added-walker";
import { UsedWalker } from "../support/used-walker";

export class Rule extends Lint.Rules.TypedRule {

    public static metadata: Lint.IRuleMetadata = {
        description: "Enforces the importation of patched observables and operators used in the module.",
        options: {
            properties: {
                file: { type: "string" }
            },
            type: "object"
        },
        optionsDescription: Lint.Utils.dedent`
            An optional object with the property \`file\`.
            This the path of the module - relative to the \`tsconfig.json\` - that imports the patched observables and operators.
            If not specified, patched observables and operators must be imported in the modules in which they are used.`,
        requiresTypeInfo: true,
        ruleName: "rxjs-add",
        type: "functionality",
        typescriptOnly: true
    };

    public static FAILURE_STRING = "RxJS add import is missing";

    public applyWithProgram(sourceFile: ts.SourceFile, program: ts.Program): Lint.RuleFailure[] {

        return this.applyWithWalker(new Walker(sourceFile, this.getOptions(), program));
    }
}

class Walker extends UsedWalker {

    private static fileWalkerCache = new Map<ts.Program, AddedWalker>();

    protected onSourceFileEnd(): void {

        let { addedObservables, addedOperators }  = this;
        let failure = Rule.FAILURE_STRING;

        const [options] = this.getOptions();
        if (options && options.file) {

            const walker = this.walkFile(options.file);
            addedObservables = walker.addedObservables;
            addedOperators = walker.addedOperators;
            failure = `${Rule.FAILURE_STRING} from ${options.file}`;
        }

        Object.keys(this.usedObservables).forEach((key) => {

            if (!addedObservables[key]) {
                this.usedObservables[key].forEach((node) => this.addFailureAtNode(
                    node,
                    `${failure}: ${key}`
                ));
            }
        });

        Object.keys(this.usedOperators).forEach((key) => {

            if (!addedOperators[key]) {
                this.usedOperators[key].forEach((node) => this.addFailureAtNode(
                    node,
                    `${failure}: ${key}`
                ));
            }
        });
    }

    private findSourceFile(file: string): ts.SourceFile {

        const program = this.getProgram();
        const rootFiles = program.getRootFileNames();

        for (let i = 0, length = rootFiles.length; i < length; ++i) {
            const configFile = ts.findConfigFile(
                this.normalizeFile(path.dirname(rootFiles[i])),
                ts.sys.fileExists
            );
            if (configFile) {
                const resolvedFile = this.normalizeFile(
                    path.resolve(path.dirname(configFile), file)
                );
                const sourceFile = program.getSourceFileByPath(resolvedFile as any);
                if (sourceFile) {
                    return sourceFile;
                } else {
                    break;
                }
            }
        }

        throw new Error(`Cannot find ${file}`);
    }

    private normalizeFile(file: string): string {

        const normalized = ts["normalizeSlashes"](file);
        return ts.sys.useCaseSensitiveFileNames ? normalized : normalized.toLowerCase();
    }

    private walkFile(file: string): AddedWalker {

        const program = this.getProgram();
        let fileWalker = Walker.fileWalkerCache.get(program);
        if (!fileWalker) {

            const sourceFile = this.findSourceFile(file);
            fileWalker = new AddedWalker(sourceFile, {
                disabledIntervals: [],
                ruleArguments: [],
                ruleName: this.getRuleName(),
                ruleSeverity: "error"
            }, program);

            fileWalker.walk(sourceFile);
            Walker.fileWalkerCache.set(program, fileWalker);
        }
        return fileWalker;
    }
}
