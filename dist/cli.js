#!/usr/bin/env node
import { createRequire as __cl_createRequire } from "node:module";
const require = __cl_createRequire(import.meta.url);
import {
  BLOCK_START,
  BranchSummary,
  CliError,
  Config,
  IsoDate,
  LIVE_META_NAME,
  LockBusyError,
  MESSAGE_HASH,
  MESSAGE_ID,
  SESSION_SCHEMA,
  SessionInput,
  Slug,
  Status,
  TOKEN_META_NAME,
  VIEW_SCHEMA,
  appendConversationHashes,
  appendConversationTurns,
  appendEvents,
  applyEvents,
  atomicWrite,
  atomicWriteJson,
  attachChanges,
  attachThoughtTrailers,
  blame,
  buildFileHistory,
  buildViewModel,
  builtBy,
  cogitIgnored,
  commitBetween,
  compareVersions,
  countBigUnread,
  currentCliPath,
  defaultAgent,
  defaultsPrompter,
  earliestSessionStart,
  embedViewModel,
  ensureCogitGitignore,
  ensureGitignore,
  exitOnClosedPipe,
  external_exports,
  findGitRoot,
  formatShow,
  gitHooksDir,
  gitUserEmail,
  gitUserName,
  globalPaths,
  hashTurns,
  hashesToLabels,
  hookBlock,
  installGitHooks,
  isDirectory,
  isGitHookEvent,
  isPanelEditableKey,
  isRecorded,
  labelsToHashes,
  lastActive,
  listSessionIds,
  loadAllSessions,
  loadConfig,
  loadEffectiveSessions,
  loadProject,
  loadRegistry,
  loadSession,
  log,
  logFile,
  logUnread,
  markBuiltBy,
  maybeAutoCommit,
  messageHash,
  messageOrder,
  migrateGlobal,
  migrateProject,
  modelSessions,
  openProject,
  package_default,
  parseMessageRef,
  processIo,
  projectFiles,
  projectPaths,
  readCommitChanges,
  readCommitFiles,
  readCommitPatches,
  readCommitSubjects,
  readCommitThought,
  readConversationStore,
  readEvents,
  readJson,
  readProjectChanges,
  readReadState,
  readSessionHead,
  readSessionMessages,
  readThoughtTrailers,
  redactDeep,
  refreshCogitGitignore,
  resolveCommit,
  resolveProjectRoot,
  runGitHook,
  runHook,
  sameAuthor,
  seedEvents,
  selectSessions,
  sessionIdentity,
  sessionTitle,
  setMessageRead,
  shortHash,
  show,
  sideOwnedParents,
  spawnDetachedProcess,
  stamp,
  stampedIdentity,
  statusCard,
  storedMessages,
  takeMigrationWarnings,
  uninstallGitHooks,
  updateConfig,
  updateProject,
  updateRegistry,
  updateSession,
  upgradeSessionIds,
  versionNotice,
  why,
  withLock
} from "./chunk-WDGQM5KX.js";

// node_modules/commander/lib/error.js
var CommanderError = class extends Error {
  /**
   * Constructs the CommanderError class
   * @param {number} exitCode suggested exit code which could be used with process.exit
   * @param {string} code an id string representing the error
   * @param {string} message human-readable description of the error
   */
  constructor(exitCode, code, message) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
    this.name = this.constructor.name;
    this.code = code;
    this.exitCode = exitCode;
    this.nestedError = void 0;
  }
};
var InvalidArgumentError = class extends CommanderError {
  /**
   * Constructs the InvalidArgumentError class
   * @param {string} [message] explanation of why argument is invalid
   */
  constructor(message) {
    super(1, "commander.invalidArgument", message);
    Error.captureStackTrace(this, this.constructor);
    this.name = this.constructor.name;
  }
};

// node_modules/commander/lib/argument.js
var Argument = class {
  /**
   * Initialize a new command argument with the given name and description.
   * The default is that the argument is required, and you can explicitly
   * indicate this with <> around the name. Put [] around the name for an optional argument.
   *
   * @param {string} name
   * @param {string} [description]
   */
  constructor(name, description) {
    this.description = description || "";
    this.variadic = false;
    this.parseArg = void 0;
    this.defaultValue = void 0;
    this.defaultValueDescription = void 0;
    this.argChoices = void 0;
    switch (name[0]) {
      case "<":
        this.required = true;
        this._name = name.slice(1, -1);
        break;
      case "[":
        this.required = false;
        this._name = name.slice(1, -1);
        break;
      default:
        this.required = true;
        this._name = name;
        break;
    }
    if (this._name.endsWith("...")) {
      this.variadic = true;
      this._name = this._name.slice(0, -3);
    }
  }
  /**
   * Return argument name.
   *
   * @return {string}
   */
  name() {
    return this._name;
  }
  /**
   * @package
   */
  _collectValue(value, previous) {
    if (previous === this.defaultValue || !Array.isArray(previous)) {
      return [value];
    }
    previous.push(value);
    return previous;
  }
  /**
   * Set the default value, and optionally supply the description to be displayed in the help.
   *
   * @param {*} value
   * @param {string} [description]
   * @return {Argument}
   */
  default(value, description) {
    this.defaultValue = value;
    this.defaultValueDescription = description;
    return this;
  }
  /**
   * Set the custom handler for processing CLI command arguments into argument values.
   *
   * @param {Function} [fn]
   * @return {Argument}
   */
  argParser(fn) {
    this.parseArg = fn;
    return this;
  }
  /**
   * Only allow argument value to be one of choices.
   *
   * @param {string[]} values
   * @return {Argument}
   */
  choices(values) {
    this.argChoices = values.slice();
    this.parseArg = (arg, previous) => {
      if (!this.argChoices.includes(arg)) {
        throw new InvalidArgumentError(
          `Allowed choices are ${this.argChoices.join(", ")}.`
        );
      }
      if (this.variadic) {
        return this._collectValue(arg, previous);
      }
      return arg;
    };
    return this;
  }
  /**
   * Make argument required.
   *
   * @returns {Argument}
   */
  argRequired() {
    this.required = true;
    return this;
  }
  /**
   * Make argument optional.
   *
   * @returns {Argument}
   */
  argOptional() {
    this.required = false;
    return this;
  }
};
function humanReadableArgName(arg) {
  const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
  return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
}

// node_modules/commander/lib/command.js
import { EventEmitter } from "events";
import childProcess from "child_process";
import path from "path";
import fs from "fs";
import process2 from "process";
import { stripVTControlCharacters as stripVTControlCharacters2 } from "util";

// node_modules/commander/lib/help.js
import { stripVTControlCharacters } from "util";
var Help = class {
  constructor() {
    this.helpWidth = void 0;
    this.minWidthToWrap = 40;
    this.sortSubcommands = false;
    this.sortOptions = false;
    this.showGlobalOptions = false;
  }
  /**
   * prepareContext is called by Commander after applying overrides from `Command.configureHelp()`
   * and just before calling `formatHelp()`.
   *
   * Commander just uses the helpWidth and the rest is provided for optional use by more complex subclasses.
   *
   * @param {{ error?: boolean, helpWidth?: number, outputHasColors?: boolean }} contextOptions
   */
  prepareContext(contextOptions) {
    this.helpWidth = this.helpWidth ?? contextOptions.helpWidth ?? 80;
  }
  /**
   * Get an array of the visible subcommands. Includes a placeholder for the implicit help command, if there is one.
   *
   * @param {Command} cmd
   * @returns {Command[]}
   */
  visibleCommands(cmd) {
    const visibleCommands = cmd.commands.filter((cmd2) => !cmd2._hidden);
    const helpCommand = cmd._getHelpCommand();
    if (helpCommand && !helpCommand._hidden) {
      visibleCommands.push(helpCommand);
    }
    if (this.sortSubcommands) {
      visibleCommands.sort((a, b) => {
        return a.name().localeCompare(b.name());
      });
    }
    return visibleCommands;
  }
  /**
   * Compare options for sort.
   *
   * @param {Option} a
   * @param {Option} b
   * @returns {number}
   */
  compareOptions(a, b) {
    const getSortKey = (option) => {
      return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
    };
    return getSortKey(a).localeCompare(getSortKey(b));
  }
  /**
   * Get an array of the visible options. Includes a placeholder for the implicit help option, if there is one.
   *
   * @param {Command} cmd
   * @returns {Option[]}
   */
  visibleOptions(cmd) {
    const visibleOptions = cmd.options.filter((option) => !option.hidden);
    const helpOption = cmd._getHelpOption();
    if (helpOption && !helpOption.hidden) {
      const removeShort = helpOption.short && cmd._findOption(helpOption.short);
      const removeLong = helpOption.long && cmd._findOption(helpOption.long);
      if (!removeShort && !removeLong) {
        visibleOptions.push(helpOption);
      } else if (helpOption.long && !removeLong) {
        visibleOptions.push(
          cmd.createOption(helpOption.long, helpOption.description)
        );
      } else if (helpOption.short && !removeShort) {
        visibleOptions.push(
          cmd.createOption(helpOption.short, helpOption.description)
        );
      }
    }
    if (this.sortOptions) {
      visibleOptions.sort(this.compareOptions);
    }
    return visibleOptions;
  }
  /**
   * Get an array of the visible global options. (Not including help.)
   *
   * @param {Command} cmd
   * @returns {Option[]}
   */
  visibleGlobalOptions(cmd) {
    if (!this.showGlobalOptions) return [];
    const globalOptions = [];
    for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
      const visibleOptions = ancestorCmd.options.filter(
        (option) => !option.hidden
      );
      globalOptions.push(...visibleOptions);
    }
    if (this.sortOptions) {
      globalOptions.sort(this.compareOptions);
    }
    return globalOptions;
  }
  /**
   * Get an array of the arguments if any have a description.
   *
   * @param {Command} cmd
   * @returns {Argument[]}
   */
  visibleArguments(cmd) {
    if (cmd._argsDescription) {
      cmd.registeredArguments.forEach((argument) => {
        argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
      });
    }
    if (cmd.registeredArguments.find((argument) => argument.description)) {
      return cmd.registeredArguments;
    }
    return [];
  }
  /**
   * Get the command term to show in the list of subcommands.
   *
   * @param {Command} cmd
   * @returns {string}
   */
  subcommandTerm(cmd) {
    const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
    return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + // simplistic check for non-help option
    (args ? " " + args : "");
  }
  /**
   * Get the option term to show in the list of options.
   *
   * @param {Option} option
   * @returns {string}
   */
  optionTerm(option) {
    return option.flags;
  }
  /**
   * Get the argument term to show in the list of arguments.
   *
   * @param {Argument} argument
   * @returns {string}
   */
  argumentTerm(argument) {
    return argument.name();
  }
  /**
   * Get the longest command term length.
   *
   * @param {Command} cmd
   * @param {Help} helper
   * @returns {number}
   */
  longestSubcommandTermLength(cmd, helper) {
    return helper.visibleCommands(cmd).reduce((max, command) => {
      return Math.max(
        max,
        this.displayWidth(
          helper.styleSubcommandTerm(helper.subcommandTerm(command))
        )
      );
    }, 0);
  }
  /**
   * Get the longest option term length.
   *
   * @param {Command} cmd
   * @param {Help} helper
   * @returns {number}
   */
  longestOptionTermLength(cmd, helper) {
    return helper.visibleOptions(cmd).reduce((max, option) => {
      return Math.max(
        max,
        this.displayWidth(helper.styleOptionTerm(helper.optionTerm(option)))
      );
    }, 0);
  }
  /**
   * Get the longest global option term length.
   *
   * @param {Command} cmd
   * @param {Help} helper
   * @returns {number}
   */
  longestGlobalOptionTermLength(cmd, helper) {
    return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
      return Math.max(
        max,
        this.displayWidth(helper.styleOptionTerm(helper.optionTerm(option)))
      );
    }, 0);
  }
  /**
   * Get the longest argument term length.
   *
   * @param {Command} cmd
   * @param {Help} helper
   * @returns {number}
   */
  longestArgumentTermLength(cmd, helper) {
    return helper.visibleArguments(cmd).reduce((max, argument) => {
      return Math.max(
        max,
        this.displayWidth(
          helper.styleArgumentTerm(helper.argumentTerm(argument))
        )
      );
    }, 0);
  }
  /**
   * Get the command usage to be displayed at the top of the built-in help.
   *
   * @param {Command} cmd
   * @returns {string}
   */
  commandUsage(cmd) {
    let cmdName = cmd._name;
    if (cmd._aliases[0]) {
      cmdName = cmdName + "|" + cmd._aliases[0];
    }
    let ancestorCmdNames = "";
    for (let ancestorCmd = cmd.parent; ancestorCmd; ancestorCmd = ancestorCmd.parent) {
      ancestorCmdNames = ancestorCmd.name() + " " + ancestorCmdNames;
    }
    return ancestorCmdNames + cmdName + " " + cmd.usage();
  }
  /**
   * Get the description for the command.
   *
   * @param {Command} cmd
   * @returns {string}
   */
  commandDescription(cmd) {
    return cmd.description();
  }
  /**
   * Get the subcommand summary to show in the list of subcommands.
   * (Fallback to description for backwards compatibility.)
   *
   * @param {Command} cmd
   * @returns {string}
   */
  subcommandDescription(cmd) {
    return cmd.summary() || cmd.description();
  }
  /**
   * Get the option description to show in the list of options.
   *
   * @param {Option} option
   * @return {string}
   */
  optionDescription(option) {
    const extraInfo = [];
    if (option.argChoices) {
      extraInfo.push(
        // use stringify to match the display of the default value
        `choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
      );
    }
    if (option.defaultValue !== void 0) {
      const showDefault = option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean";
      if (showDefault) {
        extraInfo.push(
          `default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`
        );
      }
    }
    if (option.presetArg !== void 0 && option.optional) {
      extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
    }
    if (option.envVar !== void 0) {
      extraInfo.push(`env: ${option.envVar}`);
    }
    if (extraInfo.length > 0) {
      const extraDescription = `(${extraInfo.join(", ")})`;
      if (option.description) {
        return `${option.description} ${extraDescription}`;
      }
      return extraDescription;
    }
    return option.description;
  }
  /**
   * Get the argument description to show in the list of arguments.
   *
   * @param {Argument} argument
   * @return {string}
   */
  argumentDescription(argument) {
    const extraInfo = [];
    if (argument.argChoices) {
      extraInfo.push(
        // use stringify to match the display of the default value
        `choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`
      );
    }
    if (argument.defaultValue !== void 0) {
      extraInfo.push(
        `default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`
      );
    }
    if (extraInfo.length > 0) {
      const extraDescription = `(${extraInfo.join(", ")})`;
      if (argument.description) {
        return `${argument.description} ${extraDescription}`;
      }
      return extraDescription;
    }
    return argument.description;
  }
  /**
   * Format a list of items, given a heading and an array of formatted items.
   *
   * @param {string} heading
   * @param {string[]} items
   * @param {Help} helper
   * @returns string[]
   */
  formatItemList(heading, items, helper) {
    if (items.length === 0) return [];
    return [helper.styleTitle(heading), ...items, ""];
  }
  /**
   * Group items by their help group heading.
   *
   * @param {Command[] | Option[]} unsortedItems
   * @param {Command[] | Option[]} visibleItems
   * @param {Function} getGroup
   * @returns {Map<string, Command[] | Option[]>}
   */
  groupItems(unsortedItems, visibleItems, getGroup) {
    const result = /* @__PURE__ */ new Map();
    unsortedItems.forEach((item) => {
      const group = getGroup(item);
      if (!result.has(group)) result.set(group, []);
    });
    visibleItems.forEach((item) => {
      const group = getGroup(item);
      if (!result.has(group)) {
        result.set(group, []);
      }
      result.get(group).push(item);
    });
    return result;
  }
  /**
   * Generate the built-in help text.
   *
   * @param {Command} cmd
   * @param {Help} helper
   * @returns {string}
   */
  formatHelp(cmd, helper) {
    const termWidth = helper.padWidth(cmd, helper);
    const helpWidth = helper.helpWidth ?? 80;
    function callFormatItem(term, description) {
      return helper.formatItem(term, termWidth, description, helper);
    }
    let output = [
      `${helper.styleTitle("Usage:")} ${helper.styleUsage(helper.commandUsage(cmd))}`,
      ""
    ];
    const commandDescription = helper.commandDescription(cmd);
    if (commandDescription.length > 0) {
      output = output.concat([
        helper.boxWrap(
          helper.styleCommandDescription(commandDescription),
          helpWidth
        ),
        ""
      ]);
    }
    const argumentList = helper.visibleArguments(cmd).map((argument) => {
      return callFormatItem(
        helper.styleArgumentTerm(helper.argumentTerm(argument)),
        helper.styleArgumentDescription(helper.argumentDescription(argument))
      );
    });
    output = output.concat(
      this.formatItemList("Arguments:", argumentList, helper)
    );
    const optionGroups = this.groupItems(
      cmd.options,
      helper.visibleOptions(cmd),
      (option) => option.helpGroupHeading ?? "Options:"
    );
    optionGroups.forEach((options, group) => {
      const optionList = options.map((option) => {
        return callFormatItem(
          helper.styleOptionTerm(helper.optionTerm(option)),
          helper.styleOptionDescription(helper.optionDescription(option))
        );
      });
      output = output.concat(this.formatItemList(group, optionList, helper));
    });
    if (helper.showGlobalOptions) {
      const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
        return callFormatItem(
          helper.styleOptionTerm(helper.optionTerm(option)),
          helper.styleOptionDescription(helper.optionDescription(option))
        );
      });
      output = output.concat(
        this.formatItemList("Global Options:", globalOptionList, helper)
      );
    }
    const commandGroups = this.groupItems(
      cmd.commands,
      helper.visibleCommands(cmd),
      (sub) => sub.helpGroup() || "Commands:"
    );
    commandGroups.forEach((commands, group) => {
      const commandList = commands.map((sub) => {
        return callFormatItem(
          helper.styleSubcommandTerm(helper.subcommandTerm(sub)),
          helper.styleSubcommandDescription(helper.subcommandDescription(sub))
        );
      });
      output = output.concat(this.formatItemList(group, commandList, helper));
    });
    return output.join("\n");
  }
  /**
   * Return display width of string, ignoring ANSI escape sequences. Used in padding and wrapping calculations.
   *
   * @param {string} str
   * @returns {number}
   */
  displayWidth(str) {
    return stripVTControlCharacters(str).length;
  }
  /**
   * Style the title for displaying in the help. Called with 'Usage:', 'Options:', etc.
   *
   * @param {string} str
   * @returns {string}
   */
  styleTitle(str) {
    return str;
  }
  styleUsage(str) {
    return str.split(" ").map((word) => {
      if (word === "[options]") return this.styleOptionText(word);
      if (word === "[command]") return this.styleSubcommandText(word);
      if (word[0] === "[" || word[0] === "<")
        return this.styleArgumentText(word);
      return this.styleCommandText(word);
    }).join(" ");
  }
  styleCommandDescription(str) {
    return this.styleDescriptionText(str);
  }
  styleOptionDescription(str) {
    return this.styleDescriptionText(str);
  }
  styleSubcommandDescription(str) {
    return this.styleDescriptionText(str);
  }
  styleArgumentDescription(str) {
    return this.styleDescriptionText(str);
  }
  styleDescriptionText(str) {
    return str;
  }
  styleOptionTerm(str) {
    return this.styleOptionText(str);
  }
  styleSubcommandTerm(str) {
    return str.split(" ").map((word) => {
      if (word === "[options]") return this.styleOptionText(word);
      if (word[0] === "[" || word[0] === "<")
        return this.styleArgumentText(word);
      return this.styleSubcommandText(word);
    }).join(" ");
  }
  styleArgumentTerm(str) {
    return this.styleArgumentText(str);
  }
  styleOptionText(str) {
    return str;
  }
  styleArgumentText(str) {
    return str;
  }
  styleSubcommandText(str) {
    return str;
  }
  styleCommandText(str) {
    return str;
  }
  /**
   * Calculate the pad width from the maximum term length.
   *
   * @param {Command} cmd
   * @param {Help} helper
   * @returns {number}
   */
  padWidth(cmd, helper) {
    return Math.max(
      helper.longestOptionTermLength(cmd, helper),
      helper.longestGlobalOptionTermLength(cmd, helper),
      helper.longestSubcommandTermLength(cmd, helper),
      helper.longestArgumentTermLength(cmd, helper)
    );
  }
  /**
   * Detect manually wrapped and indented strings by checking for line break followed by whitespace.
   *
   * @param {string} str
   * @returns {boolean}
   */
  preformatted(str) {
    return /\n[^\S\r\n]/.test(str);
  }
  /**
   * Format the "item", which consists of a term and description. Pad the term and wrap the description, indenting the following lines.
   *
   * So "TTT", 5, "DDD DDDD DD DDD" might be formatted for this.helpWidth=17 like so:
   *   TTT  DDD DDDD
   *        DD DDD
   *
   * @param {string} term
   * @param {number} termWidth
   * @param {string} description
   * @param {Help} helper
   * @returns {string}
   */
  formatItem(term, termWidth, description, helper) {
    const itemIndent = 2;
    const itemIndentStr = " ".repeat(itemIndent);
    if (!description) return itemIndentStr + term;
    const paddedTerm = term.padEnd(
      termWidth + term.length - helper.displayWidth(term)
    );
    const spacerWidth = 2;
    const helpWidth = this.helpWidth ?? 80;
    const remainingWidth = helpWidth - termWidth - spacerWidth - itemIndent;
    let formattedDescription;
    if (remainingWidth < this.minWidthToWrap || helper.preformatted(description)) {
      formattedDescription = description;
    } else {
      const wrappedDescription = helper.boxWrap(description, remainingWidth);
      formattedDescription = wrappedDescription.replace(
        /\n/g,
        "\n" + " ".repeat(termWidth + spacerWidth)
      );
    }
    return itemIndentStr + paddedTerm + " ".repeat(spacerWidth) + formattedDescription.replace(/\n/g, `
${itemIndentStr}`);
  }
  /**
   * Wrap a string at whitespace, preserving existing line breaks.
   * Wrapping is skipped if the width is less than `minWidthToWrap`.
   *
   * @param {string} str
   * @param {number} width
   * @returns {string}
   */
  boxWrap(str, width) {
    if (width < this.minWidthToWrap) return str;
    const rawLines = str.split(/\r\n|\n/);
    const chunkPattern = /[\s]*[^\s]+/g;
    const wrappedLines = [];
    rawLines.forEach((line) => {
      const chunks = line.match(chunkPattern);
      if (chunks === null) {
        wrappedLines.push("");
        return;
      }
      let sumChunks = [chunks.shift()];
      let sumWidth = this.displayWidth(sumChunks[0]);
      chunks.forEach((chunk) => {
        const visibleWidth = this.displayWidth(chunk);
        if (sumWidth + visibleWidth <= width) {
          sumChunks.push(chunk);
          sumWidth += visibleWidth;
          return;
        }
        wrappedLines.push(sumChunks.join(""));
        const nextChunk = chunk.trimStart();
        sumChunks = [nextChunk];
        sumWidth = this.displayWidth(nextChunk);
      });
      wrappedLines.push(sumChunks.join(""));
    });
    return wrappedLines.join("\n");
  }
};

// node_modules/commander/lib/option.js
var Option = class {
  /**
   * Initialize a new `Option` with the given `flags` and `description`.
   *
   * @param {string} flags
   * @param {string} [description]
   */
  constructor(flags, description) {
    this.flags = flags;
    this.description = description || "";
    this.required = flags.includes("<");
    this.optional = flags.includes("[");
    this.variadic = /\w\.\.\.[>\]]$/.test(flags);
    this.mandatory = false;
    const optionFlags = splitOptionFlags(flags);
    this.short = optionFlags.shortFlag;
    this.long = optionFlags.longFlag;
    this.negate = false;
    if (this.long) {
      this.negate = this.long.startsWith("--no-");
    }
    this.defaultValue = void 0;
    this.defaultValueDescription = void 0;
    this.presetArg = void 0;
    this.envVar = void 0;
    this.parseArg = void 0;
    this.hidden = false;
    this.argChoices = void 0;
    this.conflictsWith = [];
    this.implied = void 0;
    this.helpGroupHeading = void 0;
  }
  /**
   * Set the default value, and optionally supply the description to be displayed in the help.
   *
   * @param {*} value
   * @param {string} [description]
   * @return {Option}
   */
  default(value, description) {
    this.defaultValue = value;
    this.defaultValueDescription = description;
    return this;
  }
  /**
   * Preset to use when option used without option-argument, especially optional but also boolean and negated.
   * The custom processing (parseArg) is called.
   *
   * @example
   * new Option('--color').default('GREYSCALE').preset('RGB');
   * new Option('--donate [amount]').preset('20').argParser(parseFloat);
   *
   * @param {*} arg
   * @return {Option}
   */
  preset(arg) {
    this.presetArg = arg;
    return this;
  }
  /**
   * Add option name(s) that conflict with this option.
   * An error will be displayed if conflicting options are found during parsing.
   *
   * @example
   * new Option('--rgb').conflicts('cmyk');
   * new Option('--js').conflicts(['ts', 'jsx']);
   *
   * @param {(string | string[])} names
   * @return {Option}
   */
  conflicts(names) {
    this.conflictsWith = this.conflictsWith.concat(names);
    return this;
  }
  /**
   * Specify implied option values for when this option is set and the implied options are not.
   *
   * The custom processing (parseArg) is not called on the implied values.
   *
   * @example
   * program
   *   .addOption(new Option('--log', 'write logging information to file'))
   *   .addOption(new Option('--trace', 'log extra details').implies({ log: 'trace.txt' }));
   *
   * @param {object} impliedOptionValues
   * @return {Option}
   */
  implies(impliedOptionValues) {
    let newImplied = impliedOptionValues;
    if (typeof impliedOptionValues === "string") {
      newImplied = { [impliedOptionValues]: true };
    }
    this.implied = Object.assign(this.implied || {}, newImplied);
    return this;
  }
  /**
   * Set environment variable to check for option value.
   *
   * An environment variable is only used if when processed the current option value is
   * undefined, or the source of the current value is 'default' or 'config' or 'env'.
   *
   * @param {string} name
   * @return {Option}
   */
  env(name) {
    this.envVar = name;
    return this;
  }
  /**
   * Set the custom handler for processing CLI option arguments into option values.
   *
   * @param {Function} [fn]
   * @return {Option}
   */
  argParser(fn) {
    this.parseArg = fn;
    return this;
  }
  /**
   * Whether the option is mandatory and must have a value after parsing.
   *
   * @param {boolean} [mandatory=true]
   * @return {Option}
   */
  makeOptionMandatory(mandatory = true) {
    this.mandatory = !!mandatory;
    return this;
  }
  /**
   * Hide option in help.
   *
   * @param {boolean} [hide=true]
   * @return {Option}
   */
  hideHelp(hide = true) {
    this.hidden = !!hide;
    return this;
  }
  /**
   * @package
   */
  _collectValue(value, previous) {
    if (previous === this.defaultValue || !Array.isArray(previous)) {
      return [value];
    }
    previous.push(value);
    return previous;
  }
  /**
   * Only allow option value to be one of choices.
   *
   * @param {string[]} values
   * @return {Option}
   */
  choices(values) {
    this.argChoices = values.slice();
    this.parseArg = (arg, previous) => {
      if (!this.argChoices.includes(arg)) {
        throw new InvalidArgumentError(
          `Allowed choices are ${this.argChoices.join(", ")}.`
        );
      }
      if (this.variadic) {
        return this._collectValue(arg, previous);
      }
      return arg;
    };
    return this;
  }
  /**
   * Return option name.
   *
   * @return {string}
   */
  name() {
    if (this.long) {
      return this.long.replace(/^--/, "");
    }
    return this.short.replace(/^-/, "");
  }
  /**
   * Return option name, in a camelcase format that can be used
   * as an object attribute key.
   *
   * @return {string}
   */
  attributeName() {
    if (this.negate) {
      return camelcase(this.name().replace(/^no-/, ""));
    }
    return camelcase(this.name());
  }
  /**
   * Set the help group heading.
   *
   * @param {string} heading
   * @return {Option}
   */
  helpGroup(heading) {
    this.helpGroupHeading = heading;
    return this;
  }
  /**
   * Check if `arg` matches the short or long flag.
   *
   * @param {string} arg
   * @return {boolean}
   * @package
   */
  is(arg) {
    return this.short === arg || this.long === arg;
  }
  /**
   * Return whether a boolean option.
   *
   * Options are one of boolean, negated, required argument, or optional argument.
   *
   * @return {boolean}
   * @package
   */
  isBoolean() {
    return !this.required && !this.optional && !this.negate;
  }
};
var DualOptions = class {
  /**
   * @param {Option[]} options
   */
  constructor(options) {
    this.positiveOptions = /* @__PURE__ */ new Map();
    this.negativeOptions = /* @__PURE__ */ new Map();
    this.dualOptions = /* @__PURE__ */ new Set();
    options.forEach((option) => {
      if (option.negate) {
        this.negativeOptions.set(option.attributeName(), option);
      } else {
        this.positiveOptions.set(option.attributeName(), option);
      }
    });
    this.negativeOptions.forEach((value, key) => {
      if (this.positiveOptions.has(key)) {
        this.dualOptions.add(key);
      }
    });
  }
  /**
   * Did the value come from the option, and not from possible matching dual option?
   *
   * @param {*} value
   * @param {Option} option
   * @returns {boolean}
   */
  valueFromOption(value, option) {
    const optionKey = option.attributeName();
    if (!this.dualOptions.has(optionKey)) return true;
    const preset = this.negativeOptions.get(optionKey).presetArg;
    const negativeValue = preset !== void 0 ? preset : false;
    return option.negate === (negativeValue === value);
  }
};
function camelcase(str) {
  return str.split("-").reduce((str2, word) => {
    return str2 + word[0].toUpperCase() + word.slice(1);
  });
}
function splitOptionFlags(flags) {
  let shortFlag;
  let longFlag;
  const shortFlagExp = /^-[^-]$/;
  const longFlagExp = /^--[^-]/;
  const flagParts = flags.split(/[ |,]+/).concat("guard");
  if (shortFlagExp.test(flagParts[0])) shortFlag = flagParts.shift();
  if (longFlagExp.test(flagParts[0])) longFlag = flagParts.shift();
  if (!shortFlag && shortFlagExp.test(flagParts[0]))
    shortFlag = flagParts.shift();
  if (!shortFlag && longFlagExp.test(flagParts[0])) {
    shortFlag = longFlag;
    longFlag = flagParts.shift();
  }
  if (flagParts[0].startsWith("-")) {
    const unsupportedFlag = flagParts[0];
    const baseError = `option creation failed due to '${unsupportedFlag}' in option flags '${flags}'`;
    if (/^-[^-][^-]/.test(unsupportedFlag))
      throw new Error(
        `${baseError}
- a short flag is a single dash and a single character
  - either use a single dash and a single character (for a short flag)
  - or use a double dash for a long option (and can have two, like '--ws, --workspace')`
      );
    if (shortFlagExp.test(unsupportedFlag))
      throw new Error(`${baseError}
- too many short flags`);
    if (longFlagExp.test(unsupportedFlag))
      throw new Error(`${baseError}
- too many long flags`);
    throw new Error(`${baseError}
- unrecognised flag format`);
  }
  if (shortFlag === void 0 && longFlag === void 0)
    throw new Error(
      `option creation failed due to no flags found in '${flags}'.`
    );
  return { shortFlag, longFlag };
}

// node_modules/commander/lib/suggestSimilar.js
var maxDistance = 3;
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > maxDistance)
    return Math.max(a.length, b.length);
  const d = [];
  for (let i = 0; i <= a.length; i++) {
    d[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    d[0][j] = j;
  }
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      let cost;
      if (a[i - 1] === b[j - 1]) {
        cost = 0;
      } else {
        cost = 1;
      }
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        // deletion
        d[i][j - 1] + 1,
        // insertion
        d[i - 1][j - 1] + cost
        // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}
function suggestSimilar(word, candidates) {
  if (!candidates || candidates.length === 0) return "";
  candidates = Array.from(new Set(candidates));
  const searchingOptions = word.startsWith("--");
  if (searchingOptions) {
    word = word.slice(2);
    candidates = candidates.map((candidate) => candidate.slice(2));
  }
  let similar = [];
  let bestDistance = maxDistance;
  const minSimilarity = 0.4;
  candidates.forEach((candidate) => {
    if (candidate.length <= 1) return;
    const distance = editDistance(word, candidate);
    const length = Math.max(word.length, candidate.length);
    const similarity = (length - distance) / length;
    if (similarity > minSimilarity) {
      if (distance < bestDistance) {
        bestDistance = distance;
        similar = [candidate];
      } else if (distance === bestDistance) {
        similar.push(candidate);
      }
    }
  });
  similar.sort((a, b) => a.localeCompare(b));
  if (searchingOptions) {
    similar = similar.map((candidate) => `--${candidate}`);
  }
  if (similar.length > 1) {
    return `
(Did you mean one of ${similar.join(", ")}?)`;
  }
  if (similar.length === 1) {
    return `
(Did you mean ${similar[0]}?)`;
  }
  return "";
}

// node_modules/commander/lib/command.js
var Command = class _Command extends EventEmitter {
  /**
   * Initialize a new `Command`.
   *
   * @param {string} [name]
   */
  constructor(name) {
    super();
    this.commands = [];
    this.options = [];
    this.parent = null;
    this._allowUnknownOption = false;
    this._allowExcessArguments = false;
    this.registeredArguments = [];
    this._args = this.registeredArguments;
    this.args = [];
    this.rawArgs = [];
    this.processedArgs = [];
    this._scriptPath = null;
    this._name = name || "";
    this._optionValues = {};
    this._optionValueSources = {};
    this._storeOptionsAsProperties = false;
    this._actionHandler = null;
    this._executableHandler = false;
    this._executableFile = null;
    this._executableDir = null;
    this._defaultCommandName = null;
    this._exitCallback = null;
    this._aliases = [];
    this._combineFlagAndOptionalValue = true;
    this._description = "";
    this._summary = "";
    this._argsDescription = void 0;
    this._enablePositionalOptions = false;
    this._passThroughOptions = false;
    this._lifeCycleHooks = {};
    this._showHelpAfterError = false;
    this._showSuggestionAfterError = true;
    this._savedState = null;
    this._outputConfiguration = {
      writeOut: (str) => process2.stdout.write(str),
      writeErr: (str) => process2.stderr.write(str),
      outputError: (str, write) => write(str),
      getOutHelpWidth: () => process2.stdout.isTTY ? process2.stdout.columns : void 0,
      getErrHelpWidth: () => process2.stderr.isTTY ? process2.stderr.columns : void 0,
      getOutHasColors: () => useColor() ?? (process2.stdout.isTTY && process2.stdout.hasColors?.()),
      getErrHasColors: () => useColor() ?? (process2.stderr.isTTY && process2.stderr.hasColors?.()),
      stripColor: (str) => stripVTControlCharacters2(str)
    };
    this._hidden = false;
    this._helpOption = void 0;
    this._addImplicitHelpCommand = void 0;
    this._helpCommand = void 0;
    this._helpConfiguration = {};
    this._helpGroupHeading = void 0;
    this._defaultCommandGroup = void 0;
    this._defaultOptionGroup = void 0;
  }
  /**
   * Copy settings that are useful to have in common across root command and subcommands.
   *
   * (Used internally when adding a command using `.command()` so subcommands inherit parent settings.)
   *
   * @param {Command} sourceCommand
   * @return {Command} `this` command for chaining
   */
  copyInheritedSettings(sourceCommand) {
    this._outputConfiguration = sourceCommand._outputConfiguration;
    this._helpOption = sourceCommand._helpOption;
    this._helpCommand = sourceCommand._helpCommand;
    this._helpConfiguration = sourceCommand._helpConfiguration;
    this._exitCallback = sourceCommand._exitCallback;
    this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
    this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
    this._allowExcessArguments = sourceCommand._allowExcessArguments;
    this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
    this._showHelpAfterError = sourceCommand._showHelpAfterError;
    this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
    return this;
  }
  /**
   * @returns {Command[]}
   * @private
   */
  _getCommandAndAncestors() {
    const result = [];
    for (let command = this; command; command = command.parent) {
      result.push(command);
    }
    return result;
  }
  /**
   * Define a command.
   *
   * There are two styles of command: pay attention to where to put the description.
   *
   * @example
   * // Command implemented using action handler (description is supplied separately to `.command`)
   * program
   *   .command('clone <source> [destination]')
   *   .description('clone a repository into a newly created directory')
   *   .action((source, destination) => {
   *     console.log('clone command called');
   *   });
   *
   * // Command implemented using separate executable file (description is second parameter to `.command`)
   * program
   *   .command('start <service>', 'start named service')
   *   .command('stop [service]', 'stop named service, or all if no name supplied');
   *
   * @param {string} nameAndArgs - command name and arguments, args are `<required>` or `[optional]` and last may also be `variadic...`
   * @param {(object | string)} [actionOptsOrExecDesc] - configuration options (for action), or description (for executable)
   * @param {object} [execOpts] - configuration options (for executable)
   * @return {Command} returns new command for action handler, or `this` for executable command
   */
  command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
    let desc = actionOptsOrExecDesc;
    let opts = execOpts;
    if (typeof desc === "object" && desc !== null) {
      opts = desc;
      desc = null;
    }
    opts = opts || {};
    const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
    const cmd = this.createCommand(name);
    if (desc) {
      cmd.description(desc);
      cmd._executableHandler = true;
    }
    if (opts.isDefault) this._defaultCommandName = cmd._name;
    cmd._hidden = !!(opts.noHelp || opts.hidden);
    cmd._executableFile = opts.executableFile || null;
    if (args) cmd.arguments(args);
    this._registerCommand(cmd);
    cmd.parent = this;
    cmd.copyInheritedSettings(this);
    if (desc) return this;
    return cmd;
  }
  /**
   * Factory routine to create a new unattached command.
   *
   * See .command() for creating an attached subcommand, which uses this routine to
   * create the command. You can override createCommand to customise subcommands.
   *
   * @param {string} [name]
   * @return {Command} new command
   */
  createCommand(name) {
    return new _Command(name);
  }
  /**
   * You can customise the help with a subclass of Help by overriding createHelp,
   * or by overriding Help properties using configureHelp().
   *
   * @return {Help}
   */
  createHelp() {
    return Object.assign(new Help(), this.configureHelp());
  }
  /**
   * You can customise the help by overriding Help properties using configureHelp(),
   * or with a subclass of Help by overriding createHelp().
   *
   * @param {object} [configuration] - configuration options
   * @return {(Command | object)} `this` command for chaining, or stored configuration
   */
  configureHelp(configuration) {
    if (configuration === void 0) return this._helpConfiguration;
    this._helpConfiguration = configuration;
    return this;
  }
  /**
   * The default output goes to stdout and stderr. You can customise this for special
   * applications. You can also customise the display of errors by overriding outputError.
   *
   * The configuration properties are all functions:
   *
   *     // change how output being written, defaults to stdout and stderr
   *     writeOut(str)
   *     writeErr(str)
   *     // change how output being written for errors, defaults to writeErr
   *     outputError(str, write) // used for displaying errors and not used for displaying help
   *     // specify width for wrapping help
   *     getOutHelpWidth()
   *     getErrHelpWidth()
   *     // color support, currently only used with Help
   *     getOutHasColors()
   *     getErrHasColors()
   *     stripColor() // used to remove ANSI escape codes if output does not have colors
   *
   * @param {object} [configuration] - configuration options
   * @return {(Command | object)} `this` command for chaining, or stored configuration
   */
  configureOutput(configuration) {
    if (configuration === void 0) return this._outputConfiguration;
    this._outputConfiguration = {
      ...this._outputConfiguration,
      ...configuration
    };
    return this;
  }
  /**
   * Display the help or a custom message after an error occurs.
   *
   * @param {(boolean|string)} [displayHelp]
   * @return {Command} `this` command for chaining
   */
  showHelpAfterError(displayHelp = true) {
    if (typeof displayHelp !== "string") displayHelp = !!displayHelp;
    this._showHelpAfterError = displayHelp;
    return this;
  }
  /**
   * Display suggestion of similar commands for unknown commands, or options for unknown options.
   *
   * @param {boolean} [displaySuggestion]
   * @return {Command} `this` command for chaining
   */
  showSuggestionAfterError(displaySuggestion = true) {
    this._showSuggestionAfterError = !!displaySuggestion;
    return this;
  }
  /**
   * Add a prepared subcommand.
   *
   * See .command() for creating an attached subcommand which inherits settings from its parent.
   *
   * @param {Command} cmd - new subcommand
   * @param {object} [opts] - configuration options
   * @return {Command} `this` command for chaining
   */
  addCommand(cmd, opts) {
    if (!cmd._name) {
      throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
    }
    opts = opts || {};
    if (opts.isDefault) this._defaultCommandName = cmd._name;
    if (opts.noHelp || opts.hidden) cmd._hidden = true;
    this._registerCommand(cmd);
    cmd.parent = this;
    cmd._checkForBrokenPassThrough();
    return this;
  }
  /**
   * Factory routine to create a new unattached argument.
   *
   * See .argument() for creating an attached argument, which uses this routine to
   * create the argument. You can override createArgument to return a custom argument.
   *
   * @param {string} name
   * @param {string} [description]
   * @return {Argument} new argument
   */
  createArgument(name, description) {
    return new Argument(name, description);
  }
  /**
   * Define argument syntax for command.
   *
   * The default is that the argument is required, and you can explicitly
   * indicate this with <> around the name. Put [] around the name for an optional argument.
   *
   * @example
   * program.argument('<input-file>');
   * program.argument('[output-file]');
   *
   * @param {string} name
   * @param {string} [description]
   * @param {(Function|*)} [parseArg] - custom argument processing function or default value
   * @param {*} [defaultValue]
   * @return {Command} `this` command for chaining
   */
  argument(name, description, parseArg, defaultValue) {
    const argument = this.createArgument(name, description);
    if (typeof parseArg === "function") {
      argument.default(defaultValue).argParser(parseArg);
    } else {
      argument.default(parseArg);
    }
    this.addArgument(argument);
    return this;
  }
  /**
   * Define argument syntax for command, adding multiple at once (without descriptions).
   *
   * See also .argument().
   *
   * @example
   * program.arguments('<cmd> [env]');
   *
   * @param {string} names
   * @return {Command} `this` command for chaining
   */
  arguments(names) {
    names.trim().split(/ +/).forEach((detail) => {
      this.argument(detail);
    });
    return this;
  }
  /**
   * Define argument syntax for command, adding a prepared argument.
   *
   * @param {Argument} argument
   * @return {Command} `this` command for chaining
   */
  addArgument(argument) {
    const previousArgument = this.registeredArguments.slice(-1)[0];
    if (previousArgument?.variadic) {
      throw new Error(
        `only the last argument can be variadic '${previousArgument.name()}'`
      );
    }
    if (argument.required && argument.defaultValue !== void 0 && argument.parseArg === void 0) {
      throw new Error(
        `a default value for a required argument is never used: '${argument.name()}'`
      );
    }
    this.registeredArguments.push(argument);
    return this;
  }
  /**
   * Customise or override default help command. By default a help command is automatically added if your command has subcommands.
   *
   * @example
   *    program.helpCommand('help [cmd]');
   *    program.helpCommand('help [cmd]', 'show help');
   *    program.helpCommand(false); // suppress default help command
   *    program.helpCommand(true); // add help command even if no subcommands
   *
   * @param {string|boolean} enableOrNameAndArgs - enable with custom name and/or arguments, or boolean to override whether added
   * @param {string} [description] - custom description
   * @return {Command} `this` command for chaining
   */
  helpCommand(enableOrNameAndArgs, description) {
    if (typeof enableOrNameAndArgs === "boolean") {
      this._addImplicitHelpCommand = enableOrNameAndArgs;
      if (enableOrNameAndArgs && this._defaultCommandGroup) {
        this._initCommandGroup(this._getHelpCommand());
      }
      return this;
    }
    const nameAndArgs = enableOrNameAndArgs ?? "help [command]";
    const [, helpName, helpArgs] = nameAndArgs.match(/([^ ]+) *(.*)/);
    const helpDescription = description ?? "display help for command";
    const helpCommand = this.createCommand(helpName);
    helpCommand.helpOption(false);
    if (helpArgs) helpCommand.arguments(helpArgs);
    if (helpDescription) helpCommand.description(helpDescription);
    this._addImplicitHelpCommand = true;
    this._helpCommand = helpCommand;
    if (enableOrNameAndArgs || description) this._initCommandGroup(helpCommand);
    return this;
  }
  /**
   * Add prepared custom help command.
   *
   * @param {(Command|string|boolean)} helpCommand - custom help command, or deprecated enableOrNameAndArgs as for `.helpCommand()`
   * @param {string} [deprecatedDescription] - deprecated custom description used with custom name only
   * @return {Command} `this` command for chaining
   */
  addHelpCommand(helpCommand, deprecatedDescription) {
    if (typeof helpCommand !== "object") {
      this.helpCommand(helpCommand, deprecatedDescription);
      return this;
    }
    this._addImplicitHelpCommand = true;
    this._helpCommand = helpCommand;
    this._initCommandGroup(helpCommand);
    return this;
  }
  /**
   * Lazy create help command.
   *
   * @return {(Command|null)}
   * @package
   */
  _getHelpCommand() {
    const hasImplicitHelpCommand = this._addImplicitHelpCommand ?? (this.commands.length && !this._actionHandler && !this._findCommand("help"));
    if (hasImplicitHelpCommand) {
      if (this._helpCommand === void 0) {
        this.helpCommand(void 0, void 0);
      }
      return this._helpCommand;
    }
    return null;
  }
  /**
   * Add hook for life cycle event.
   *
   * @param {string} event
   * @param {Function} listener
   * @return {Command} `this` command for chaining
   */
  hook(event, listener) {
    const allowedValues = ["preSubcommand", "preAction", "postAction"];
    if (!allowedValues.includes(event)) {
      throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
    }
    if (this._lifeCycleHooks[event]) {
      this._lifeCycleHooks[event].push(listener);
    } else {
      this._lifeCycleHooks[event] = [listener];
    }
    return this;
  }
  /**
   * Register callback to use as replacement for calling process.exit.
   *
   * @param {Function} [fn] optional callback which will be passed a CommanderError, defaults to throwing
   * @return {Command} `this` command for chaining
   */
  exitOverride(fn) {
    if (fn) {
      this._exitCallback = fn;
    } else {
      this._exitCallback = (err) => {
        if (err.code !== "commander.executeSubCommandAsync") {
          throw err;
        } else {
        }
      };
    }
    return this;
  }
  /**
   * Call process.exit, and _exitCallback if defined.
   *
   * @param {number} exitCode exit code for using with process.exit
   * @param {string} code an id string representing the error
   * @param {string} message human-readable description of the error
   * @return never
   * @private
   */
  _exit(exitCode, code, message) {
    if (this._exitCallback) {
      this._exitCallback(new CommanderError(exitCode, code, message));
    }
    process2.exit(exitCode);
  }
  /**
   * Register callback `fn` for the command.
   *
   * @example
   * program
   *   .command('serve')
   *   .description('start service')
   *   .action(function() {
   *      // do work here
   *   });
   *
   * @param {Function} fn
   * @return {Command} `this` command for chaining
   */
  action(fn) {
    const listener = (args) => {
      const expectedArgsCount = this.registeredArguments.length;
      const actionArgs = args.slice(0, expectedArgsCount);
      if (this._storeOptionsAsProperties) {
        actionArgs[expectedArgsCount] = this;
      } else {
        actionArgs[expectedArgsCount] = this.opts();
      }
      actionArgs.push(this);
      return fn.apply(this, actionArgs);
    };
    this._actionHandler = listener;
    return this;
  }
  /**
   * Factory routine to create a new unattached option.
   *
   * See .option() for creating an attached option, which uses this routine to
   * create the option. You can override createOption to return a custom option.
   *
   * @param {string} flags
   * @param {string} [description]
   * @return {Option} new option
   */
  createOption(flags, description) {
    return new Option(flags, description);
  }
  /**
   * Wrap parseArgs to catch 'commander.invalidArgument'.
   *
   * @param {(Option | Argument)} target
   * @param {string} value
   * @param {*} previous
   * @param {string} invalidArgumentMessage
   * @private
   */
  _callParseArg(target, value, previous, invalidArgumentMessage) {
    try {
      return target.parseArg(value, previous);
    } catch (err) {
      if (err.code === "commander.invalidArgument") {
        const message = `${invalidArgumentMessage} ${err.message}`;
        this.error(message, { exitCode: err.exitCode, code: err.code });
      }
      throw err;
    }
  }
  /**
   * Check for option flag conflicts.
   * Register option if no conflicts found, or throw on conflict.
   *
   * @param {Option} option
   * @private
   */
  _registerOption(option) {
    const matchingOption = option.short && this._findOption(option.short) || option.long && this._findOption(option.long);
    if (matchingOption) {
      const matchingFlag = option.long && this._findOption(option.long) ? option.long : option.short;
      throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting flag '${matchingFlag}'
-  already used by option '${matchingOption.flags}'`);
    }
    this._initOptionGroup(option);
    this.options.push(option);
  }
  /**
   * Check for command name and alias conflicts with existing commands.
   * Register command if no conflicts found, or throw on conflict.
   *
   * @param {Command} command
   * @private
   */
  _registerCommand(command) {
    const knownBy = (cmd) => {
      return [cmd.name()].concat(cmd.aliases());
    };
    const alreadyUsed = knownBy(command).find(
      (name) => this._findCommand(name)
    );
    if (alreadyUsed) {
      const existingCmd = knownBy(this._findCommand(alreadyUsed)).join("|");
      const newCmd = knownBy(command).join("|");
      throw new Error(
        `cannot add command '${newCmd}' as already have command '${existingCmd}'`
      );
    }
    this._initCommandGroup(command);
    this.commands.push(command);
  }
  /**
   * Add an option.
   *
   * @param {Option} option
   * @return {Command} `this` command for chaining
   */
  addOption(option) {
    this._registerOption(option);
    const oname = option.name();
    const name = option.attributeName();
    if (option.defaultValue !== void 0) {
      this.setOptionValueWithSource(name, option.defaultValue, "default");
    }
    const handleOptionValue = (val, invalidValueMessage, valueSource) => {
      if (val == null && option.presetArg !== void 0) {
        val = option.presetArg;
      }
      const oldValue = this.getOptionValue(name);
      if (val !== null && option.parseArg) {
        val = this._callParseArg(option, val, oldValue, invalidValueMessage);
      } else if (val !== null && option.variadic) {
        val = option._collectValue(val, oldValue);
      }
      if (val == null) {
        if (option.negate) {
          val = false;
        } else if (option.isBoolean() || option.optional) {
          val = true;
        } else {
          val = "";
        }
      }
      this.setOptionValueWithSource(name, val, valueSource);
    };
    this.on("option:" + oname, (val) => {
      const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
      handleOptionValue(val, invalidValueMessage, "cli");
    });
    if (option.envVar) {
      this.on("optionEnv:" + oname, (val) => {
        const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
        handleOptionValue(val, invalidValueMessage, "env");
      });
    }
    return this;
  }
  /**
   * Internal implementation shared by .option() and .requiredOption()
   *
   * @return {Command} `this` command for chaining
   * @private
   */
  _optionEx(config, flags, description, fn, defaultValue) {
    if (typeof flags === "object" && flags instanceof Option) {
      throw new Error(
        "To add an Option object use addOption() instead of option() or requiredOption()"
      );
    }
    const option = this.createOption(flags, description);
    option.makeOptionMandatory(!!config.mandatory);
    if (typeof fn === "function") {
      option.default(defaultValue).argParser(fn);
    } else if (fn instanceof RegExp) {
      const regex = fn;
      fn = (val, def) => {
        const m = regex.exec(val);
        return m ? m[0] : def;
      };
      option.default(defaultValue).argParser(fn);
    } else {
      option.default(fn);
    }
    return this.addOption(option);
  }
  /**
   * Define option with `flags`, `description`, and optional argument parsing function or `defaultValue` or both.
   *
   * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space. A required
   * option-argument is indicated by `<>` and an optional option-argument by `[]`.
   *
   * See the README for more details, and see also addOption() and requiredOption().
   *
   * @example
   * program
   *     .option('-p, --pepper', 'add pepper')
   *     .option('--pt, --pizza-type <TYPE>', 'type of pizza') // required option-argument
   *     .option('-c, --cheese [CHEESE]', 'add extra cheese', 'mozzarella') // optional option-argument with default
   *     .option('-t, --tip <VALUE>', 'add tip to purchase cost', parseFloat) // custom parse function
   *
   * @param {string} flags
   * @param {string} [description]
   * @param {(Function|*)} [parseArg] - custom option processing function or default value
   * @param {*} [defaultValue]
   * @return {Command} `this` command for chaining
   */
  option(flags, description, parseArg, defaultValue) {
    return this._optionEx({}, flags, description, parseArg, defaultValue);
  }
  /**
   * Add a required option which must have a value after parsing. This usually means
   * the option must be specified on the command line. (Otherwise the same as .option().)
   *
   * The `flags` string contains the short and/or long flags, separated by comma, a pipe or space.
   *
   * @param {string} flags
   * @param {string} [description]
   * @param {(Function|*)} [parseArg] - custom option processing function or default value
   * @param {*} [defaultValue]
   * @return {Command} `this` command for chaining
   */
  requiredOption(flags, description, parseArg, defaultValue) {
    return this._optionEx(
      { mandatory: true },
      flags,
      description,
      parseArg,
      defaultValue
    );
  }
  /**
   * Alter parsing of short flags with optional values.
   *
   * @example
   * // for `.option('-f,--flag [value]'):
   * program.combineFlagAndOptionalValue(true);  // `-f80` is treated like `--flag=80`, this is the default behaviour
   * program.combineFlagAndOptionalValue(false) // `-fb` is treated like `-f -b`
   *
   * @param {boolean} [combine] - if `true` or omitted, an optional value can be specified directly after the flag.
   * @return {Command} `this` command for chaining
   */
  combineFlagAndOptionalValue(combine = true) {
    this._combineFlagAndOptionalValue = !!combine;
    return this;
  }
  /**
   * Allow unknown options on the command line.
   *
   * @param {boolean} [allowUnknown] - if `true` or omitted, no error will be thrown for unknown options.
   * @return {Command} `this` command for chaining
   */
  allowUnknownOption(allowUnknown = true) {
    this._allowUnknownOption = !!allowUnknown;
    return this;
  }
  /**
   * Allow excess command-arguments on the command line. Pass false to make excess arguments an error.
   *
   * @param {boolean} [allowExcess] - if `true` or omitted, no error will be thrown for excess arguments.
   * @return {Command} `this` command for chaining
   */
  allowExcessArguments(allowExcess = true) {
    this._allowExcessArguments = !!allowExcess;
    return this;
  }
  /**
   * Enable positional options. Positional means global options are specified before subcommands which lets
   * subcommands reuse the same option names, and also enables subcommands to turn on passThroughOptions.
   * The default behaviour is non-positional and global options may appear anywhere on the command line.
   *
   * @param {boolean} [positional]
   * @return {Command} `this` command for chaining
   */
  enablePositionalOptions(positional = true) {
    this._enablePositionalOptions = !!positional;
    return this;
  }
  /**
   * Pass through options that come after command-arguments rather than treat them as command-options,
   * so actual command-options come before command-arguments. Turning this on for a subcommand requires
   * positional options to have been enabled on the program (parent commands).
   * The default behaviour is non-positional and options may appear before or after command-arguments.
   *
   * @param {boolean} [passThrough] for unknown options.
   * @return {Command} `this` command for chaining
   */
  passThroughOptions(passThrough = true) {
    this._passThroughOptions = !!passThrough;
    this._checkForBrokenPassThrough();
    return this;
  }
  /**
   * @private
   */
  _checkForBrokenPassThrough() {
    if (this.parent && this._passThroughOptions && !this.parent._enablePositionalOptions) {
      throw new Error(
        `passThroughOptions cannot be used for '${this._name}' without turning on enablePositionalOptions for parent command(s)`
      );
    }
  }
  /**
   * Whether to store option values as properties on command object,
   * or store separately (specify false). In both cases the option values can be accessed using .opts().
   *
   * @param {boolean} [storeAsProperties=true]
   * @return {Command} `this` command for chaining
   */
  storeOptionsAsProperties(storeAsProperties = true) {
    if (this.options.length) {
      throw new Error("call .storeOptionsAsProperties() before adding options");
    }
    if (Object.keys(this._optionValues).length) {
      throw new Error(
        "call .storeOptionsAsProperties() before setting option values"
      );
    }
    this._storeOptionsAsProperties = !!storeAsProperties;
    return this;
  }
  /**
   * Retrieve option value.
   *
   * @param {string} key
   * @return {object} value
   */
  getOptionValue(key) {
    if (this._storeOptionsAsProperties) {
      return this[key];
    }
    return this._optionValues[key];
  }
  /**
   * Store option value.
   *
   * @param {string} key
   * @param {object} value
   * @return {Command} `this` command for chaining
   */
  setOptionValue(key, value) {
    return this.setOptionValueWithSource(key, value, void 0);
  }
  /**
   * Store option value and where the value came from.
   *
   * @param {string} key
   * @param {object} value
   * @param {string} source - expected values are default/config/env/cli/implied
   * @return {Command} `this` command for chaining
   */
  setOptionValueWithSource(key, value, source) {
    if (this._storeOptionsAsProperties) {
      this[key] = value;
    } else {
      this._optionValues[key] = value;
    }
    this._optionValueSources[key] = source;
    return this;
  }
  /**
   * Get source of option value.
   * Expected values are default | config | env | cli | implied
   *
   * @param {string} key
   * @return {string}
   */
  getOptionValueSource(key) {
    return this._optionValueSources[key];
  }
  /**
   * Get source of option value. See also .optsWithGlobals().
   * Expected values are default | config | env | cli | implied
   *
   * @param {string} key
   * @return {string}
   */
  getOptionValueSourceWithGlobals(key) {
    let source;
    this._getCommandAndAncestors().forEach((cmd) => {
      if (cmd.getOptionValueSource(key) !== void 0) {
        source = cmd.getOptionValueSource(key);
      }
    });
    return source;
  }
  /**
   * Get user arguments from implied or explicit arguments.
   * Side-effects: set _scriptPath if args included script. Used for default program name, and subcommand searches.
   *
   * @private
   */
  _prepareUserArgs(argv, parseOptions) {
    if (argv !== void 0 && !Array.isArray(argv)) {
      throw new Error("first parameter to parse must be array or undefined");
    }
    parseOptions = parseOptions || {};
    if (argv === void 0 && parseOptions.from === void 0) {
      if (process2.versions?.electron) {
        parseOptions.from = "electron";
      }
      const execArgv = process2.execArgv ?? [];
      if (execArgv.includes("-e") || execArgv.includes("--eval") || execArgv.includes("-p") || execArgv.includes("--print")) {
        parseOptions.from = "eval";
      }
    }
    if (argv === void 0) {
      argv = process2.argv;
    }
    this.rawArgs = argv.slice();
    let userArgs;
    switch (parseOptions.from) {
      case void 0:
      case "node":
        this._scriptPath = argv[1];
        userArgs = argv.slice(2);
        break;
      case "electron":
        if (process2.defaultApp) {
          this._scriptPath = argv[1];
          userArgs = argv.slice(2);
        } else {
          userArgs = argv.slice(1);
        }
        break;
      case "user":
        userArgs = argv.slice(0);
        break;
      case "eval":
        userArgs = argv.slice(1);
        break;
      default:
        throw new Error(
          `unexpected parse option { from: '${parseOptions.from}' }`
        );
    }
    if (!this._name && this._scriptPath)
      this.nameFromFilename(this._scriptPath);
    this._name = this._name || "program";
    return userArgs;
  }
  /**
   * Parse `argv`, setting options and invoking commands when defined.
   *
   * Use parseAsync instead of parse if any of your action handlers are async.
   *
   * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
   *
   * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
   * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
   * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
   * - `'user'`: just user arguments
   *
   * @example
   * program.parse(); // parse process.argv and auto-detect electron and special node flags
   * program.parse(process.argv); // assume argv[0] is app and argv[1] is script
   * program.parse(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
   *
   * @param {string[]} [argv] - optional, defaults to process.argv
   * @param {object} [parseOptions] - optionally specify style of options with from: node/user/electron
   * @param {string} [parseOptions.from] - where the args are from: 'node', 'user', 'electron'
   * @return {Command} `this` command for chaining
   */
  parse(argv, parseOptions) {
    this._prepareForParse();
    const userArgs = this._prepareUserArgs(argv, parseOptions);
    this._parseCommand([], userArgs);
    return this;
  }
  /**
   * Parse `argv`, setting options and invoking commands when defined.
   *
   * Call with no parameters to parse `process.argv`. Detects Electron and special node options like `node --eval`. Easy mode!
   *
   * Or call with an array of strings to parse, and optionally where the user arguments start by specifying where the arguments are `from`:
   * - `'node'`: default, `argv[0]` is the application and `argv[1]` is the script being run, with user arguments after that
   * - `'electron'`: `argv[0]` is the application and `argv[1]` varies depending on whether the electron application is packaged
   * - `'user'`: just user arguments
   *
   * @example
   * await program.parseAsync(); // parse process.argv and auto-detect electron and special node flags
   * await program.parseAsync(process.argv); // assume argv[0] is app and argv[1] is script
   * await program.parseAsync(my-args, { from: 'user' }); // just user supplied arguments, nothing special about argv[0]
   *
   * @param {string[]} [argv]
   * @param {object} [parseOptions]
   * @param {string} parseOptions.from - where the args are from: 'node', 'user', 'electron'
   * @return {Promise}
   */
  async parseAsync(argv, parseOptions) {
    this._prepareForParse();
    const userArgs = this._prepareUserArgs(argv, parseOptions);
    await this._parseCommand([], userArgs);
    return this;
  }
  _prepareForParse() {
    if (this._savedState === null) {
      this.options.filter(
        (option) => option.negate && option.defaultValue === void 0 && this.getOptionValue(option.attributeName()) === void 0
      ).forEach((option) => {
        const positiveLongFlag = option.long.replace(/^--no-/, "--");
        if (!this._findOption(positiveLongFlag)) {
          this.setOptionValueWithSource(
            option.attributeName(),
            true,
            "default"
          );
        }
      });
      this.saveStateBeforeParse();
    } else {
      this.restoreStateBeforeParse();
    }
  }
  /**
   * Called the first time parse is called to save state and allow a restore before subsequent calls to parse.
   * Not usually called directly, but available for subclasses to save their custom state.
   *
   * This is called in a lazy way. Only commands used in parsing chain will have state saved.
   */
  saveStateBeforeParse() {
    this._savedState = {
      // name is stable if supplied by author, but may be unspecified for root command and deduced during parsing
      _name: this._name,
      // option values before parse have default values (including false for negated options)
      // shallow clones
      _optionValues: { ...this._optionValues },
      _optionValueSources: { ...this._optionValueSources }
    };
  }
  /**
   * Restore state before parse for calls after the first.
   * Not usually called directly, but available for subclasses to save their custom state.
   *
   * This is called in a lazy way. Only commands used in parsing chain will have state restored.
   */
  restoreStateBeforeParse() {
    if (this._storeOptionsAsProperties)
      throw new Error(`Can not call parse again when storeOptionsAsProperties is true.
- either make a new Command for each call to parse, or stop storing options as properties`);
    this._name = this._savedState._name;
    this._scriptPath = null;
    this.rawArgs = [];
    this._optionValues = { ...this._savedState._optionValues };
    this._optionValueSources = { ...this._savedState._optionValueSources };
    this.args = [];
    this.processedArgs = [];
  }
  /**
   * Throw if expected executable is missing. Add lots of help for author.
   *
   * @param {string} executableFile
   * @param {string} executableDir
   * @param {string} subcommandName
   */
  _checkForMissingExecutable(executableFile, executableDir, subcommandName) {
    if (fs.existsSync(executableFile)) return;
    const executableDirMessage = executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory";
    const executableMissing = `'${executableFile}' does not exist
 - if '${subcommandName}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
    throw new Error(executableMissing);
  }
  /**
   * Execute a sub-command executable.
   *
   * @private
   */
  _executeSubCommand(subcommand, args) {
    args = args.slice();
    const sourceExt = [".js", ".ts", ".tsx", ".mjs", ".cjs"];
    function findFile(baseDir, baseName) {
      const localBin = path.resolve(baseDir, baseName);
      if (fs.existsSync(localBin)) return localBin;
      if (sourceExt.includes(path.extname(baseName))) return void 0;
      const foundExt = sourceExt.find(
        (ext) => fs.existsSync(`${localBin}${ext}`)
      );
      if (foundExt) return `${localBin}${foundExt}`;
      return void 0;
    }
    this._checkForMissingMandatoryOptions();
    this._checkForConflictingOptions();
    let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
    let executableDir = this._executableDir || "";
    if (this._scriptPath) {
      let resolvedScriptPath;
      try {
        resolvedScriptPath = fs.realpathSync(this._scriptPath);
      } catch {
        resolvedScriptPath = this._scriptPath;
      }
      executableDir = path.resolve(
        path.dirname(resolvedScriptPath),
        executableDir
      );
    }
    if (executableDir) {
      let localFile = findFile(executableDir, executableFile);
      if (!localFile && !subcommand._executableFile && this._scriptPath) {
        const legacyName = path.basename(
          this._scriptPath,
          path.extname(this._scriptPath)
        );
        if (legacyName !== this._name) {
          localFile = findFile(
            executableDir,
            `${legacyName}-${subcommand._name}`
          );
        }
      }
      executableFile = localFile || executableFile;
    }
    const launchWithNode = sourceExt.includes(path.extname(executableFile));
    let proc;
    if (process2.platform !== "win32") {
      if (launchWithNode) {
        args.unshift(executableFile);
        args = incrementNodeInspectorPort(process2.execArgv).concat(args);
        proc = childProcess.spawn(process2.argv[0], args, { stdio: "inherit" });
      } else {
        proc = childProcess.spawn(executableFile, args, { stdio: "inherit" });
      }
    } else {
      this._checkForMissingExecutable(
        executableFile,
        executableDir,
        subcommand._name
      );
      args.unshift(executableFile);
      args = incrementNodeInspectorPort(process2.execArgv).concat(args);
      proc = childProcess.spawn(process2.execPath, args, { stdio: "inherit" });
    }
    if (!proc.killed) {
      const signals = ["SIGUSR1", "SIGUSR2", "SIGTERM", "SIGINT", "SIGHUP"];
      signals.forEach((signal) => {
        process2.on(signal, () => {
          if (proc.killed === false && proc.exitCode === null) {
            proc.kill(signal);
          }
        });
      });
    }
    const exitCallback = this._exitCallback;
    proc.on("close", (code) => {
      code = code ?? 1;
      if (!exitCallback) {
        process2.exit(code);
      } else {
        exitCallback(
          new CommanderError(
            code,
            "commander.executeSubCommandAsync",
            "(close)"
          )
        );
      }
    });
    proc.on("error", (err) => {
      if (err.code === "ENOENT") {
        this._checkForMissingExecutable(
          executableFile,
          executableDir,
          subcommand._name
        );
      } else if (err.code === "EACCES") {
        throw new Error(`'${executableFile}' not executable`);
      }
      if (!exitCallback) {
        process2.exit(1);
      } else {
        const wrappedError = new CommanderError(
          1,
          "commander.executeSubCommandAsync",
          "(error)"
        );
        wrappedError.nestedError = err;
        exitCallback(wrappedError);
      }
    });
    this.runningCommand = proc;
  }
  /**
   * @private
   */
  _dispatchSubcommand(commandName, operands, unknown) {
    const subCommand = this._findCommand(commandName);
    if (!subCommand) this.help({ error: true });
    subCommand._prepareForParse();
    let promiseChain;
    promiseChain = this._chainOrCallSubCommandHook(
      promiseChain,
      subCommand,
      "preSubcommand"
    );
    promiseChain = this._chainOrCall(promiseChain, () => {
      if (subCommand._executableHandler) {
        this._executeSubCommand(subCommand, operands.concat(unknown));
      } else {
        return subCommand._parseCommand(operands, unknown);
      }
    });
    return promiseChain;
  }
  /**
   * Invoke help directly if possible, or dispatch if necessary.
   * e.g. help foo
   *
   * @private
   */
  _dispatchHelpCommand(subcommandName) {
    if (!subcommandName) {
      this.help();
    }
    const subCommand = this._findCommand(subcommandName);
    if (subCommand && !subCommand._executableHandler) {
      subCommand.help();
    }
    return this._dispatchSubcommand(
      subcommandName,
      [],
      [this._getHelpOption()?.long ?? this._getHelpOption()?.short ?? "--help"]
    );
  }
  /**
   * Check this.args against expected this.registeredArguments.
   *
   * @private
   */
  _checkNumberOfArguments() {
    this.registeredArguments.forEach((arg, i) => {
      if (arg.required && this.args[i] == null) {
        this.missingArgument(arg.name());
      }
    });
    if (this.registeredArguments.length > 0 && this.registeredArguments[this.registeredArguments.length - 1].variadic) {
      return;
    }
    if (this.args.length > this.registeredArguments.length) {
      this._excessArguments(this.args);
    }
  }
  /**
   * Process this.args using this.registeredArguments and save as this.processedArgs!
   *
   * @private
   */
  _processArguments() {
    const myParseArg = (argument, value, previous) => {
      let parsedValue = value;
      if (value !== null && argument.parseArg) {
        const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
        parsedValue = this._callParseArg(
          argument,
          value,
          previous,
          invalidValueMessage
        );
      }
      return parsedValue;
    };
    this._checkNumberOfArguments();
    const processedArgs = [];
    this.registeredArguments.forEach((declaredArg, index) => {
      let value = declaredArg.defaultValue;
      if (declaredArg.variadic) {
        if (index < this.args.length) {
          value = this.args.slice(index);
          if (declaredArg.parseArg) {
            value = value.reduce((processed, v) => {
              return myParseArg(declaredArg, v, processed);
            }, declaredArg.defaultValue);
          }
        } else if (value === void 0) {
          value = [];
        }
      } else if (index < this.args.length) {
        value = this.args[index];
        if (declaredArg.parseArg) {
          value = myParseArg(declaredArg, value, declaredArg.defaultValue);
        }
      }
      processedArgs[index] = value;
    });
    this.processedArgs = processedArgs;
  }
  /**
   * Once we have a promise we chain, but call synchronously until then.
   *
   * @param {(Promise|undefined)} promise
   * @param {Function} fn
   * @return {(Promise|undefined)}
   * @private
   */
  _chainOrCall(promise, fn) {
    if (promise?.then && typeof promise.then === "function") {
      return promise.then(() => fn());
    }
    return fn();
  }
  /**
   *
   * @param {(Promise|undefined)} promise
   * @param {string} event
   * @return {(Promise|undefined)}
   * @private
   */
  _chainOrCallHooks(promise, event) {
    let result = promise;
    const hooks = [];
    this._getCommandAndAncestors().reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== void 0).forEach((hookedCommand) => {
      hookedCommand._lifeCycleHooks[event].forEach((callback) => {
        hooks.push({ hookedCommand, callback });
      });
    });
    if (event === "postAction") {
      hooks.reverse();
    }
    hooks.forEach((hookDetail) => {
      result = this._chainOrCall(result, () => {
        return hookDetail.callback(hookDetail.hookedCommand, this);
      });
    });
    return result;
  }
  /**
   *
   * @param {(Promise|undefined)} promise
   * @param {Command} subCommand
   * @param {string} event
   * @return {(Promise|undefined)}
   * @private
   */
  _chainOrCallSubCommandHook(promise, subCommand, event) {
    let result = promise;
    if (this._lifeCycleHooks[event] !== void 0) {
      this._lifeCycleHooks[event].forEach((hook) => {
        result = this._chainOrCall(result, () => {
          return hook(this, subCommand);
        });
      });
    }
    return result;
  }
  /**
   * Process arguments in context of this command.
   * Returns action result, in case it is a promise.
   *
   * @private
   */
  _parseCommand(operands, unknown) {
    const parsed2 = this.parseOptions(unknown);
    this._parseOptionsEnv();
    this._parseOptionsImplied();
    operands = operands.concat(parsed2.operands);
    unknown = parsed2.unknown;
    this.args = operands.concat(unknown);
    if (operands && this._findCommand(operands[0])) {
      return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
    }
    if (this._getHelpCommand() && operands[0] === this._getHelpCommand().name()) {
      return this._dispatchHelpCommand(operands[1]);
    }
    if (this._defaultCommandName) {
      this._outputHelpIfRequested(unknown);
      return this._dispatchSubcommand(
        this._defaultCommandName,
        operands,
        unknown
      );
    }
    if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
      this.help({ error: true });
    }
    this._outputHelpIfRequested(parsed2.unknown);
    this._checkForMissingMandatoryOptions();
    this._checkForConflictingOptions();
    const checkForUnknownOptions = () => {
      if (parsed2.unknown.length > 0) {
        this.unknownOption(parsed2.unknown[0]);
      }
    };
    const commandEvent = `command:${this.name()}`;
    if (this._actionHandler) {
      checkForUnknownOptions();
      this._processArguments();
      let promiseChain;
      promiseChain = this._chainOrCallHooks(promiseChain, "preAction");
      promiseChain = this._chainOrCall(
        promiseChain,
        () => this._actionHandler(this.processedArgs)
      );
      if (this.parent) {
        promiseChain = this._chainOrCall(promiseChain, () => {
          this.parent.emit(commandEvent, operands, unknown);
        });
      }
      promiseChain = this._chainOrCallHooks(promiseChain, "postAction");
      return promiseChain;
    }
    if (this.parent?.listenerCount(commandEvent)) {
      checkForUnknownOptions();
      this._processArguments();
      this.parent.emit(commandEvent, operands, unknown);
    } else if (operands.length) {
      if (this._findCommand("*")) {
        return this._dispatchSubcommand("*", operands, unknown);
      }
      if (this.listenerCount("command:*")) {
        this.emit("command:*", operands, unknown);
      } else if (this.commands.length) {
        this.unknownCommand();
      } else {
        checkForUnknownOptions();
        this._processArguments();
      }
    } else if (this.commands.length) {
      checkForUnknownOptions();
      this.help({ error: true });
    } else {
      checkForUnknownOptions();
      this._processArguments();
    }
  }
  /**
   * Find matching command.
   *
   * @private
   * @return {Command | undefined}
   */
  _findCommand(name) {
    if (!name) return void 0;
    return this.commands.find(
      (cmd) => cmd._name === name || cmd._aliases.includes(name)
    );
  }
  /**
   * Return an option matching `arg` if any.
   *
   * @param {string} arg
   * @return {Option}
   * @package
   */
  _findOption(arg) {
    return this.options.find((option) => option.is(arg));
  }
  /**
   * Display an error message if a mandatory option does not have a value.
   * Called after checking for help flags in leaf subcommand.
   *
   * @private
   */
  _checkForMissingMandatoryOptions() {
    this._getCommandAndAncestors().forEach((cmd) => {
      cmd.options.forEach((anOption) => {
        if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === void 0) {
          cmd.missingMandatoryOptionValue(anOption);
        }
      });
    });
  }
  /**
   * Display an error message if conflicting options are used together in this.
   *
   * @private
   */
  _checkForConflictingLocalOptions() {
    const definedNonDefaultOptions = this.options.filter((option) => {
      const optionKey = option.attributeName();
      if (this.getOptionValue(optionKey) === void 0) {
        return false;
      }
      return this.getOptionValueSource(optionKey) !== "default";
    });
    const optionsWithConflicting = definedNonDefaultOptions.filter(
      (option) => option.conflictsWith.length > 0
    );
    optionsWithConflicting.forEach((option) => {
      const conflictingAndDefined = definedNonDefaultOptions.find(
        (defined) => option.conflictsWith.includes(defined.attributeName())
      );
      if (conflictingAndDefined) {
        this._conflictingOption(option, conflictingAndDefined);
      }
    });
  }
  /**
   * Display an error message if conflicting options are used together.
   * Called after checking for help flags in leaf subcommand.
   *
   * @private
   */
  _checkForConflictingOptions() {
    this._getCommandAndAncestors().forEach((cmd) => {
      cmd._checkForConflictingLocalOptions();
    });
  }
  /**
   * Parse options from `argv` removing known options,
   * and return argv split into operands and unknown arguments.
   *
   * Side effects: modifies command by storing options. Does not reset state if called again.
   *
   * Examples:
   *
   *     argv => operands, unknown
   *     --known kkk op => [op], []
   *     op --known kkk => [op], []
   *     sub --unknown uuu op => [sub], [--unknown uuu op]
   *     sub -- --unknown uuu op => [sub --unknown uuu op], []
   *
   * @param {string[]} args
   * @return {{operands: string[], unknown: string[]}}
   */
  parseOptions(args) {
    const operands = [];
    const unknown = [];
    let dest = operands;
    function maybeOption(arg) {
      return arg.length > 1 && arg[0] === "-";
    }
    const negativeNumberArg = (arg) => {
      if (!/^-(\d+|\d*\.\d+)(e[+-]?\d+)?$/.test(arg)) return false;
      return !this._getCommandAndAncestors().some(
        (cmd) => cmd.options.map((opt) => opt.short).some((short) => /^-\d$/.test(short))
      );
    };
    let activeVariadicOption = null;
    let activeGroup = null;
    let i = 0;
    while (i < args.length || activeGroup) {
      const arg = activeGroup ?? args[i++];
      activeGroup = null;
      if (arg === "--") {
        if (dest === unknown) dest.push(arg);
        dest.push(...args.slice(i));
        break;
      }
      if (activeVariadicOption && (!maybeOption(arg) || negativeNumberArg(arg))) {
        this.emit(`option:${activeVariadicOption.name()}`, arg);
        continue;
      }
      activeVariadicOption = null;
      if (maybeOption(arg)) {
        const option = this._findOption(arg);
        if (option) {
          if (option.required) {
            const value = args[i++];
            if (value === void 0) this.optionMissingArgument(option);
            this.emit(`option:${option.name()}`, value);
          } else if (option.optional) {
            let value = null;
            if (i < args.length && (!maybeOption(args[i]) || negativeNumberArg(args[i]))) {
              value = args[i++];
            }
            this.emit(`option:${option.name()}`, value);
          } else {
            this.emit(`option:${option.name()}`);
          }
          activeVariadicOption = option.variadic ? option : null;
          continue;
        }
      }
      if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
        const option = this._findOption(`-${arg[1]}`);
        if (option) {
          if (option.required || option.optional && this._combineFlagAndOptionalValue) {
            this.emit(`option:${option.name()}`, arg.slice(2));
          } else {
            this.emit(`option:${option.name()}`);
            activeGroup = `-${arg.slice(2)}`;
          }
          continue;
        }
      }
      if (/^--[^=]+=/.test(arg)) {
        const index = arg.indexOf("=");
        const option = this._findOption(arg.slice(0, index));
        if (option && (option.required || option.optional)) {
          this.emit(`option:${option.name()}`, arg.slice(index + 1));
          continue;
        }
      }
      if (dest === operands && maybeOption(arg) && !(this.commands.length === 0 && negativeNumberArg(arg))) {
        dest = unknown;
      }
      if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
        if (this._findCommand(arg)) {
          operands.push(arg);
          unknown.push(...args.slice(i));
          break;
        } else if (this._getHelpCommand() && arg === this._getHelpCommand().name()) {
          operands.push(arg, ...args.slice(i));
          break;
        } else if (this._defaultCommandName) {
          unknown.push(arg, ...args.slice(i));
          break;
        }
      }
      if (this._passThroughOptions) {
        dest.push(arg, ...args.slice(i));
        break;
      }
      dest.push(arg);
    }
    return { operands, unknown };
  }
  /**
   * Return an object containing local option values as key-value pairs.
   *
   * @return {object}
   */
  opts() {
    if (this._storeOptionsAsProperties) {
      const result = {};
      const len = this.options.length;
      for (let i = 0; i < len; i++) {
        const key = this.options[i].attributeName();
        result[key] = key === this._versionOptionName ? this._version : this[key];
      }
      return result;
    }
    return this._optionValues;
  }
  /**
   * Return an object containing merged local and global option values as key-value pairs.
   *
   * @return {object}
   */
  optsWithGlobals() {
    return this._getCommandAndAncestors().reduce(
      (combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()),
      {}
    );
  }
  /**
   * Display error message and exit (or call exitOverride).
   *
   * @param {string} message
   * @param {object} [errorOptions]
   * @param {string} [errorOptions.code] - an id string representing the error
   * @param {number} [errorOptions.exitCode] - used with process.exit
   */
  error(message, errorOptions) {
    this._outputConfiguration.outputError(
      `${message}
`,
      this._outputConfiguration.writeErr
    );
    if (typeof this._showHelpAfterError === "string") {
      this._outputConfiguration.writeErr(`${this._showHelpAfterError}
`);
    } else if (this._showHelpAfterError) {
      this._outputConfiguration.writeErr("\n");
      this.outputHelp({ error: true });
    }
    const config = errorOptions || {};
    const exitCode = config.exitCode || 1;
    const code = config.code || "commander.error";
    this._exit(exitCode, code, message);
  }
  /**
   * Apply any option related environment variables, if option does
   * not have a value from cli or client code.
   *
   * @private
   */
  _parseOptionsEnv() {
    this.options.forEach((option) => {
      if (option.envVar && option.envVar in process2.env) {
        const optionKey = option.attributeName();
        if (this.getOptionValue(optionKey) === void 0 || ["default", "config", "env"].includes(
          this.getOptionValueSource(optionKey)
        )) {
          if (option.required || option.optional) {
            this.emit(`optionEnv:${option.name()}`, process2.env[option.envVar]);
          } else {
            this.emit(`optionEnv:${option.name()}`);
          }
        }
      }
    });
  }
  /**
   * Apply any implied option values, if option is undefined or default value.
   *
   * @private
   */
  _parseOptionsImplied() {
    const dualHelper = new DualOptions(this.options);
    const hasCustomOptionValue = (optionKey) => {
      return this.getOptionValue(optionKey) !== void 0 && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
    };
    this.options.filter(
      (option) => option.implied !== void 0 && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(
        this.getOptionValue(option.attributeName()),
        option
      )
    ).forEach((option) => {
      Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
        this.setOptionValueWithSource(
          impliedKey,
          option.implied[impliedKey],
          "implied"
        );
      });
    });
  }
  /**
   * Argument `name` is missing.
   *
   * @param {string} name
   * @private
   */
  missingArgument(name) {
    const message = `error: missing required argument '${name}'`;
    this.error(message, { code: "commander.missingArgument" });
  }
  /**
   * `Option` is missing an argument.
   *
   * @param {Option} option
   * @private
   */
  optionMissingArgument(option) {
    const message = `error: option '${option.flags}' argument missing`;
    this.error(message, { code: "commander.optionMissingArgument" });
  }
  /**
   * `Option` does not have a value, and is a mandatory option.
   *
   * @param {Option} option
   * @private
   */
  missingMandatoryOptionValue(option) {
    const message = `error: required option '${option.flags}' not specified`;
    this.error(message, { code: "commander.missingMandatoryOptionValue" });
  }
  /**
   * `Option` conflicts with another option.
   *
   * @param {Option} option
   * @param {Option} conflictingOption
   * @private
   */
  _conflictingOption(option, conflictingOption) {
    const findBestOptionFromValue = (option2) => {
      const optionKey = option2.attributeName();
      const optionValue = this.getOptionValue(optionKey);
      const negativeOption = this.options.find(
        (target) => target.negate && optionKey === target.attributeName()
      );
      const positiveOption = this.options.find(
        (target) => !target.negate && optionKey === target.attributeName()
      );
      if (negativeOption && (negativeOption.presetArg === void 0 && optionValue === false || negativeOption.presetArg !== void 0 && optionValue === negativeOption.presetArg)) {
        return negativeOption;
      }
      return positiveOption || option2;
    };
    const getErrorMessage = (option2) => {
      const bestOption = findBestOptionFromValue(option2);
      const optionKey = bestOption.attributeName();
      const source = this.getOptionValueSource(optionKey);
      if (source === "env") {
        return `environment variable '${bestOption.envVar}'`;
      }
      return `option '${bestOption.flags}'`;
    };
    const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
    this.error(message, { code: "commander.conflictingOption" });
  }
  /**
   * Unknown option `flag`.
   *
   * @param {string} flag
   * @private
   */
  unknownOption(flag) {
    if (this._allowUnknownOption) return;
    let suggestion = "";
    if (flag.startsWith("--") && this._showSuggestionAfterError) {
      let candidateFlags = [];
      let command = this;
      do {
        const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
        candidateFlags = candidateFlags.concat(moreFlags);
        command = command.parent;
      } while (command && !command._enablePositionalOptions);
      suggestion = suggestSimilar(flag, candidateFlags);
    }
    const message = `error: unknown option '${flag}'${suggestion}`;
    this.error(message, { code: "commander.unknownOption" });
  }
  /**
   * Excess arguments, more than expected.
   *
   * @param {string[]} receivedArgs
   * @private
   */
  _excessArguments(receivedArgs) {
    if (this._allowExcessArguments) return;
    const expected = this.registeredArguments.length;
    const s = expected === 1 ? "" : "s";
    const received = receivedArgs.length;
    const forSubcommand = this.parent ? ` for '${this.name()}'` : "";
    const details = receivedArgs.join(", ");
    const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${received}: ${details}.`;
    this.error(message, { code: "commander.excessArguments" });
  }
  /**
   * Unknown command.
   *
   * @private
   */
  unknownCommand() {
    const unknownName = this.args[0];
    let suggestion = "";
    if (this._showSuggestionAfterError) {
      const candidateNames = [];
      this.createHelp().visibleCommands(this).forEach((command) => {
        candidateNames.push(command.name());
        if (command.alias()) candidateNames.push(command.alias());
      });
      suggestion = suggestSimilar(unknownName, candidateNames);
    }
    const message = `error: unknown command '${unknownName}'${suggestion}`;
    this.error(message, { code: "commander.unknownCommand" });
  }
  /**
   * Get or set the program version.
   *
   * This method auto-registers the "-V, --version" option which will print the version number.
   *
   * You can optionally supply the flags and description to override the defaults.
   *
   * @param {string} [str]
   * @param {string} [flags]
   * @param {string} [description]
   * @return {(this | string | undefined)} `this` command for chaining, or version string if no arguments
   */
  version(str, flags, description) {
    if (str === void 0) return this._version;
    this._version = str;
    flags = flags || "-V, --version";
    description = description || "output the version number";
    const versionOption = this.createOption(flags, description);
    this._versionOptionName = versionOption.attributeName();
    this._registerOption(versionOption);
    this.on("option:" + versionOption.name(), () => {
      this._outputConfiguration.writeOut(`${str}
`);
      this._exit(0, "commander.version", str);
    });
    return this;
  }
  /**
   * Set the description.
   *
   * @param {string} [str]
   * @param {object} [argsDescription]
   * @return {(string|Command)}
   */
  description(str, argsDescription) {
    if (str === void 0 && argsDescription === void 0)
      return this._description;
    this._description = str;
    if (argsDescription) {
      this._argsDescription = argsDescription;
    }
    return this;
  }
  /**
   * Set the summary. Used when listed as subcommand of parent.
   *
   * @param {string} [str]
   * @return {(string|Command)}
   */
  summary(str) {
    if (str === void 0) return this._summary;
    this._summary = str;
    return this;
  }
  /**
   * Set an alias for the command.
   *
   * You may call more than once to add multiple aliases. Only the first alias is shown in the auto-generated help.
   *
   * @param {string} [alias]
   * @return {(string|Command)}
   */
  alias(alias) {
    if (alias === void 0) return this._aliases[0];
    let command = this;
    if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
      command = this.commands[this.commands.length - 1];
    }
    if (alias === command._name)
      throw new Error("Command alias can't be the same as its name");
    const matchingCommand = this.parent?._findCommand(alias);
    if (matchingCommand) {
      const existingCmd = [matchingCommand.name()].concat(matchingCommand.aliases()).join("|");
      throw new Error(
        `cannot add alias '${alias}' to command '${this.name()}' as already have command '${existingCmd}'`
      );
    }
    command._aliases.push(alias);
    return this;
  }
  /**
   * Set aliases for the command.
   *
   * Only the first alias is shown in the auto-generated help.
   *
   * @param {string[]} [aliases]
   * @return {(string[]|Command)}
   */
  aliases(aliases) {
    if (aliases === void 0) return this._aliases;
    aliases.forEach((alias) => this.alias(alias));
    return this;
  }
  /**
   * Set / get the command usage `str`.
   *
   * @param {string} [str]
   * @return {(string|Command)}
   */
  usage(str) {
    if (str === void 0) {
      if (this._usage) return this._usage;
      const args = this.registeredArguments.map((arg) => {
        return humanReadableArgName(arg);
      });
      return [].concat(
        this.options.length || this._helpOption !== null ? "[options]" : [],
        this.commands.length ? "[command]" : [],
        this.registeredArguments.length ? args : []
      ).join(" ");
    }
    this._usage = str;
    return this;
  }
  /**
   * Get or set the name of the command.
   *
   * @param {string} [str]
   * @return {(string|Command)}
   */
  name(str) {
    if (str === void 0) return this._name;
    this._name = str;
    return this;
  }
  /**
   * Set/get the help group heading for this subcommand in parent command's help.
   *
   * @param {string} [heading]
   * @return {Command | string}
   */
  helpGroup(heading) {
    if (heading === void 0) return this._helpGroupHeading ?? "";
    this._helpGroupHeading = heading;
    return this;
  }
  /**
   * Set/get the default help group heading for subcommands added to this command.
   * (This does not override a group set directly on the subcommand using .helpGroup().)
   *
   * @example
   * program.commandsGroup('Development Commands:);
   * program.command('watch')...
   * program.command('lint')...
   * ...
   *
   * @param {string} [heading]
   * @returns {Command | string}
   */
  commandsGroup(heading) {
    if (heading === void 0) return this._defaultCommandGroup ?? "";
    this._defaultCommandGroup = heading;
    return this;
  }
  /**
   * Set/get the default help group heading for options added to this command.
   * (This does not override a group set directly on the option using .helpGroup().)
   *
   * @example
   * program
   *   .optionsGroup('Development Options:')
   *   .option('-d, --debug', 'output extra debugging')
   *   .option('-p, --profile', 'output profiling information')
   *
   * @param {string} [heading]
   * @returns {Command | string}
   */
  optionsGroup(heading) {
    if (heading === void 0) return this._defaultOptionGroup ?? "";
    this._defaultOptionGroup = heading;
    return this;
  }
  /**
   * @param {Option} option
   * @private
   */
  _initOptionGroup(option) {
    if (this._defaultOptionGroup && !option.helpGroupHeading)
      option.helpGroup(this._defaultOptionGroup);
  }
  /**
   * @param {Command} cmd
   * @private
   */
  _initCommandGroup(cmd) {
    if (this._defaultCommandGroup && !cmd.helpGroup())
      cmd.helpGroup(this._defaultCommandGroup);
  }
  /**
   * Set the name of the command from script filename, such as process.argv[1],
   * or import.meta.filename.
   *
   * (Used internally and public although not documented in README.)
   *
   * @example
   * program.nameFromFilename(import.meta.filename);
   *
   * @param {string} filename
   * @return {Command}
   */
  nameFromFilename(filename) {
    this._name = path.basename(filename, path.extname(filename));
    return this;
  }
  /**
   * Get or set the directory for searching for executable subcommands of this command.
   *
   * @example
   * program.executableDir(import.meta.dirname);
   * // or
   * program.executableDir('subcommands');
   *
   * @param {string} [path]
   * @return {(string|null|Command)}
   */
  executableDir(path2) {
    if (path2 === void 0) return this._executableDir;
    this._executableDir = path2;
    return this;
  }
  /**
   * Return program help documentation.
   *
   * @param {{ error: boolean }} [contextOptions] - pass {error:true} to wrap for stderr instead of stdout
   * @return {string}
   */
  helpInformation(contextOptions) {
    const helper = this.createHelp();
    const context = this._getOutputContext(contextOptions);
    helper.prepareContext({
      error: context.error,
      helpWidth: context.helpWidth,
      outputHasColors: context.hasColors
    });
    const text = helper.formatHelp(this, helper);
    if (context.hasColors) return text;
    return this._outputConfiguration.stripColor(text);
  }
  /**
   * @typedef HelpContext
   * @type {object}
   * @property {boolean} error
   * @property {number} helpWidth
   * @property {boolean} hasColors
   * @property {function} write - includes stripColor if needed
   *
   * @returns {HelpContext}
   * @private
   */
  _getOutputContext(contextOptions) {
    contextOptions = contextOptions || {};
    const error = !!contextOptions.error;
    let baseWrite;
    let hasColors;
    let helpWidth;
    if (error) {
      baseWrite = (str) => this._outputConfiguration.writeErr(str);
      hasColors = this._outputConfiguration.getErrHasColors();
      helpWidth = this._outputConfiguration.getErrHelpWidth();
    } else {
      baseWrite = (str) => this._outputConfiguration.writeOut(str);
      hasColors = this._outputConfiguration.getOutHasColors();
      helpWidth = this._outputConfiguration.getOutHelpWidth();
    }
    const write = (str) => {
      if (!hasColors) str = this._outputConfiguration.stripColor(str);
      return baseWrite(str);
    };
    return { error, write, hasColors, helpWidth };
  }
  /**
   * Output help information for this command.
   *
   * Outputs built-in help, and custom text added using `.addHelpText()`.
   *
   * @param {{ error: boolean } | Function} [contextOptions] - pass {error:true} to write to stderr instead of stdout
   */
  outputHelp(contextOptions) {
    let deprecatedCallback;
    if (typeof contextOptions === "function") {
      deprecatedCallback = contextOptions;
      contextOptions = void 0;
    }
    const outputContext = this._getOutputContext(contextOptions);
    const eventContext = {
      error: outputContext.error,
      write: outputContext.write,
      command: this
    };
    this._getCommandAndAncestors().reverse().forEach((command) => command.emit("beforeAllHelp", eventContext));
    this.emit("beforeHelp", eventContext);
    let helpInformation = this.helpInformation({ error: outputContext.error });
    if (deprecatedCallback) {
      helpInformation = deprecatedCallback(helpInformation);
      if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) {
        throw new Error("outputHelp callback must return a string or a Buffer");
      }
    }
    outputContext.write(helpInformation);
    if (this._getHelpOption()?.long) {
      this.emit(this._getHelpOption().long);
    }
    this.emit("afterHelp", eventContext);
    this._getCommandAndAncestors().forEach(
      (command) => command.emit("afterAllHelp", eventContext)
    );
  }
  /**
   * You can pass in flags and a description to customise the built-in help option.
   * Pass in false to disable the built-in help option.
   *
   * @example
   * program.helpOption('-?, --help' 'show help'); // customise
   * program.helpOption(false); // disable
   *
   * @param {(string | boolean)} flags
   * @param {string} [description]
   * @return {Command} `this` command for chaining
   */
  helpOption(flags, description) {
    if (typeof flags === "boolean") {
      if (flags) {
        if (this._helpOption === null) this._helpOption = void 0;
        if (this._defaultOptionGroup) {
          this._initOptionGroup(this._getHelpOption());
        }
      } else {
        this._helpOption = null;
      }
      return this;
    }
    this._helpOption = this.createOption(
      flags ?? "-h, --help",
      description ?? "display help for command"
    );
    if (flags || description) this._initOptionGroup(this._helpOption);
    return this;
  }
  /**
   * Lazy create help option.
   * Returns null if has been disabled with .helpOption(false).
   *
   * @returns {(Option | null)} the help option
   * @package
   */
  _getHelpOption() {
    if (this._helpOption === void 0) {
      this.helpOption(void 0, void 0);
    }
    return this._helpOption;
  }
  /**
   * Supply your own option to use for the built-in help option.
   * This is an alternative to using helpOption() to customise the flags and description etc.
   *
   * @param {Option} option
   * @return {Command} `this` command for chaining
   */
  addHelpOption(option) {
    this._helpOption = option;
    this._initOptionGroup(option);
    return this;
  }
  /**
   * Output help information and exit.
   *
   * Outputs built-in help, and custom text added using `.addHelpText()`.
   *
   * @param {{ error: boolean }} [contextOptions] - pass {error:true} to write to stderr instead of stdout
   */
  help(contextOptions) {
    this.outputHelp(contextOptions);
    let exitCode = Number(process2.exitCode ?? 0);
    if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) {
      exitCode = 1;
    }
    this._exit(exitCode, "commander.help", "(outputHelp)");
  }
  /**
   * // Do a little typing to coordinate emit and listener for the help text events.
   * @typedef HelpTextEventContext
   * @type {object}
   * @property {boolean} error
   * @property {Command} command
   * @property {function} write
   */
  /**
   * Add additional text to be displayed with the built-in help.
   *
   * Position is 'before' or 'after' to affect just this command,
   * and 'beforeAll' or 'afterAll' to affect this command and all its subcommands.
   *
   * @param {string} position - before or after built-in help
   * @param {(string | Function)} text - string to add, or a function returning a string
   * @return {Command} `this` command for chaining
   */
  addHelpText(position, text) {
    const allowedValues = ["beforeAll", "before", "after", "afterAll"];
    if (!allowedValues.includes(position)) {
      throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
    }
    const helpEvent = `${position}Help`;
    this.on(helpEvent, (context) => {
      let helpStr;
      if (typeof text === "function") {
        helpStr = text({ error: context.error, command: context.command });
      } else {
        helpStr = text;
      }
      if (helpStr) {
        context.write(`${helpStr}
`);
      }
    });
    return this;
  }
  /**
   * Output help information if help flags specified
   *
   * @param {Array} args - array of options to search for help flags
   * @private
   */
  _outputHelpIfRequested(args) {
    const helpOption = this._getHelpOption();
    const helpRequested = helpOption && args.find((arg) => helpOption.is(arg));
    if (helpRequested) {
      this.outputHelp();
      this._exit(0, "commander.helpDisplayed", "(outputHelp)");
    }
  }
};
function incrementNodeInspectorPort(args) {
  return args.map((arg) => {
    if (!arg.startsWith("--inspect")) {
      return arg;
    }
    let debugOption;
    let debugHost = "127.0.0.1";
    let debugPort = "9229";
    let match;
    if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
      debugOption = match[1];
    } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
      debugOption = match[1];
      if (/^\d+$/.test(match[3])) {
        debugPort = match[3];
      } else {
        debugHost = match[3];
      }
    } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
      debugOption = match[1];
      debugHost = match[3];
      debugPort = match[4];
    }
    if (debugOption && debugPort !== "0") {
      return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
    }
    return arg;
  });
}
function useColor() {
  if (process2.env.NO_COLOR || process2.env.FORCE_COLOR === "0" || process2.env.FORCE_COLOR === "false")
    return false;
  if (process2.env.FORCE_COLOR || process2.env.CLICOLOR_FORCE !== void 0)
    return true;
  return void 0;
}

// node_modules/commander/index.js
var program = new Command();

// src/commands/backfill.ts
import { spawn } from "child_process";

// src/commands/session.ts
import { readFile as readFile2, rm as rm2 } from "fs/promises";
import { resolve as resolve3 } from "path";

// src/schema/merge.ts
var SIDE_FIELDS = [
  "title",
  "summary",
  "why",
  "decidedBy",
  "alternatives",
  "commits",
  "files",
  "branch",
  "work",
  "agentDecisions",
  "shape"
];
function isEmptyValue(value) {
  return value === void 0 || value === null || value === "" || Array.isArray(value) && value.length === 0;
}
function mergeSide(prev, input) {
  const next = { ...prev };
  const marks = {};
  for (const field of SIDE_FIELDS) {
    const value = input[field];
    if (value === void 0 || !isEmptyValue(prev[field]) && prev.by?.[field] !== "side") {
      continue;
    }
    next[field] = value;
    marks[field] = "side";
  }
  return Object.keys(marks).length === 0 ? prev : { ...next, by: { ...prev.by ?? {}, ...marks } };
}
function agentMarks(prev, input) {
  const marks = { ...prev?.by ?? {} };
  for (const field of SIDE_FIELDS) if (input[field] !== void 0) delete marks[field];
  return Object.keys(marks).length > 0 ? marks : void 0;
}
function sideMarks(input) {
  const marks = {};
  for (const field of SIDE_FIELDS) if (input[field] !== void 0) marks[field] = "side";
  return Object.keys(marks).length > 0 ? marks : void 0;
}
function mergeSession(existing, input, now, opts = {}) {
  if (existing && existing.sessionId !== input.sessionId) {
    throw new Error(`session id mismatch: ${existing.sessionId} vs ${input.sessionId}`);
  }
  const base = existing ?? {
    schema: SESSION_SCHEMA,
    sessionId: input.sessionId,
    agent: "claude-code",
    title: "",
    startedAt: now,
    updatedAt: now,
    status: { goal: "", done: [], pending: [], next: "" },
    nodes: []
  };
  const nodes = new Map(base.nodes.map((n) => [n.id, n]));
  const recorded = /* @__PURE__ */ new Map();
  for (const n of [...base.nodes, ...input.nodes ?? []]) {
    if (n.kind !== "message") continue;
    const fromTable = opts.order?.get(n.id);
    const number = messageNumber(n);
    const position = fromTable ?? (number === null ? null : number - 1);
    if (position !== null) recorded.set(n.id, position);
  }
  const label = (id) => opts.labels?.get(id) ?? id;
  const messageWarnings = [];
  const side = opts.by === "side";
  for (const { parent, links, ...n } of input.nodes ?? []) {
    const prev = nodes.get(n.id);
    const own = n.kind === "message" ? recorded.get(n.id) ?? null : null;
    if (side && prev) {
      const merged2 = mergeSide(prev, n);
      const nextParent2 = parent !== void 0 && own !== null && (opts.sideOwnsParent?.has(n.id) ?? false) ? checkParent(n.id, parent, own, recorded, messageWarnings, label, opts.crossTargets) : prev.parent ?? null;
      const next2 = { ...merged2, parent: nextParent2 };
      nodes.set(n.id, {
        ...next2,
        addedAt: prev.addedAt,
        touchedAt: sameNode(prev, next2) ? prev.touchedAt : now
      });
      continue;
    }
    const nextParent = parent !== void 0 && own !== null ? checkParent(n.id, parent, own, recorded, messageWarnings, label, opts.crossTargets) : parent === void 0 ? prev?.parent ?? null : parent;
    const nextLinks = links !== void 0 && own !== null ? checkLinks(n.id, links, own, recorded, messageWarnings, label, opts.crossTargets) : links;
    const next = {
      ...prev,
      ...n,
      parent: nextParent,
      ...nextLinks === void 0 ? {} : { links: nextLinks }
    };
    const marks = side ? sideMarks(n) : agentMarks(prev, n);
    const addedAt = prev ? prev.addedAt : now;
    nodes.set(n.id, {
      ...next,
      // An explicit undefined clears a previous side mark: the agent owns it now.
      by: marks,
      ...addedAt === void 0 ? {} : { addedAt },
      touchedAt: prev && sameNode(prev, next) ? prev.touchedAt : now
    });
  }
  const merged = {
    ...base,
    agent: input.agent ?? base.agent,
    title: input.title ?? base.title,
    status: input.status ?? base.status,
    ...input.leftOff === void 0 && base.leftOff === void 0 ? {} : { leftOff: input.leftOff ?? base.leftOff },
    nodes: [...nodes.values()],
    updatedAt: now
  };
  const warnings = [...messageWarnings, ...repairTree(merged.nodes)];
  return { session: merged, warnings };
}
function messageNumber(node) {
  if (node.kind !== "message" || !MESSAGE_ID.test(node.id)) return null;
  return Number(node.id.slice(1));
}
function isEarlierMessage(numbers, id, own) {
  const number = numbers.get(id);
  return number !== void 0 && number < own;
}
function previousMessage(numbers, own) {
  let best = null;
  let bestNumber = -1;
  for (const [id, number] of numbers) {
    if (number < own && number > bestNumber) {
      best = id;
      bestNumber = number;
    }
  }
  return best;
}
function checkParent(id, parent, own, numbers, warnings, label, crossTargets) {
  if (parent === null || isEarlierMessage(numbers, parent, own)) return parent;
  if (isCrossTarget(parent, crossTargets)) return parent;
  const fallback = previousMessage(numbers, own);
  const cross = parseMessageRef(parent).sessionId !== null;
  warnings.push(
    fallback === null ? `message ${label(id)}: parent ${label(parent)} is not ${cross ? "a message of an earlier session in this project" : "an earlier message of this session"}, moved to root` : `message ${label(id)}: parent ${label(parent)} is not ${cross ? "a message of an earlier session in this project" : "an earlier message of this session"}, using ${label(fallback)}`
  );
  return fallback;
}
function isCrossTarget(ref, crossTargets) {
  return parseMessageRef(ref).sessionId !== null && (crossTargets?.has(ref) ?? false);
}
function checkLinks(id, links, own, numbers, warnings, label, crossTargets) {
  return links.filter((link) => {
    if (isEarlierMessage(numbers, link, own) || isCrossTarget(link, crossTargets)) return true;
    const cross = parseMessageRef(link).sessionId !== null;
    warnings.push(
      `message ${label(id)}: link ${label(link)} is not ${cross ? "a message of an earlier session in this project" : "an earlier message of this session"}, dropped`
    );
    return false;
  });
}
var NODE_FIELDS = [
  "parent",
  "kind",
  "title",
  "summary",
  "why",
  "at",
  "decidedBy",
  "alternatives",
  "commits",
  "files",
  "links",
  "branch",
  "work",
  "agentDecisions",
  "shape"
];
function sameNode(a, b) {
  return NODE_FIELDS.every((field) => JSON.stringify(a[field]) === JSON.stringify(b[field]));
}
function repairTree(nodes) {
  const warnings = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) {
    if (n.parent !== null && parseMessageRef(n.parent).sessionId === null && !byId.has(n.parent)) {
      warnings.push(`node ${n.id}: parent ${n.parent} not found, moved to root`);
      n.parent = null;
    }
  }
  for (const n of nodes) {
    const seen = /* @__PURE__ */ new Set([n.id]);
    let cur = n.parent;
    while (cur !== null) {
      if (seen.has(cur)) {
        warnings.push(`node ${n.id}: parent cycle, moved to root`);
        n.parent = null;
        break;
      }
      seen.add(cur);
      cur = byId.get(cur)?.parent ?? null;
    }
  }
  return warnings;
}

// src/view/shape.ts
function tableRows(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells.length !== 3 || cells.some((cell) => cell === "")) return void 0;
    rows.push(cells);
  }
  return rows;
}

// src/shape.ts
var MERMAID_MAX_NODES = 10;
var MERMAID_KEYWORDS = /* @__PURE__ */ new Set([
  "flowchart",
  "graph",
  "td",
  "tb",
  "lr",
  "rl",
  "bt",
  "subgraph",
  "end",
  "direction",
  "click",
  "style",
  "class",
  "classdef",
  "linkstyle"
]);
function mermaidNodeCount(text) {
  const bare = text.replace(/%%.*$/gm, "").replace(/"[^"\n]*"/g, "").replace(/\|[^|\n]*\|/g, "").replace(/\[[^\]\n]*\]/g, "").replace(/\([^)\n]*\)/g, "").replace(/\{[^}\n]*\}/g, "");
  const ids = /* @__PURE__ */ new Set();
  for (const match of bare.matchAll(/\b[A-Za-z_][\w-]*\b/g)) {
    const word = match[0];
    if (!MERMAID_KEYWORDS.has(word.toLowerCase())) ids.add(word);
  }
  return ids.size;
}
var SEQUENCE_MAX_ACTORS = 6;
var SHAPE_TOOLS = [
  {
    kind: "pseudo",
    name: "Steps",
    when: "The change is mostly logic: a new path through functions, a rule, a check. Numbered plain-language steps, naming the functions and files they touch.",
    output: '{"kind": "pseudo", "text": "1. ...\\n2. ..."}',
    validate(text) {
      const lines = text.split("\n").map((line) => line.trim()).filter((line) => line !== "");
      if (lines.length < 2) return false;
      if (!lines.some((line) => /^\d+[.)]\s+\S/.test(line))) return false;
      return text.length <= 3e3;
    }
  },
  {
    kind: "table",
    name: "Before / After",
    when: "The change alters behaviour someone can see: a fix, a new default, a rule that now says yes or no. One row per case: what happens, how it behaved before, how it behaves now.",
    output: '{"kind": "table", "text": "A commit lands before its message is recorded | it never gets a Shape | it waits, then gets one"}',
    validate(text) {
      const rows = tableRows(text);
      return rows !== void 0 && rows.length >= 1 && rows.length <= TABLE_MAX_ROWS;
    }
  },
  {
    kind: "mermaid",
    name: "Flowchart",
    when: `The change is a flow between files or functions (a request path, a queue, a state machine). A Mermaid flowchart of at most ${MERMAID_MAX_NODES} nodes.`,
    output: '{"kind": "mermaid", "text": "flowchart TD\\n  A --> B"}',
    validate(text) {
      const source = text.trim();
      if (!/^(flowchart|graph)\s+(TD|TB|LR|RL|BT)\b/i.test(source)) return false;
      if (/<script/i.test(source)) return false;
      if (!/-->|---/.test(source)) return false;
      if (source.split("\n").length > 60) return false;
      return mermaidNodeCount(source) <= MERMAID_MAX_NODES;
    }
  },
  {
    kind: "sequence",
    name: "Sequence",
    when: `The change is a flow over time between actors that hand work to each other: a hook starting a background job, a client and a server, a queue drained later. Prefer it to a flowchart when the order of the calls is the point. A Mermaid sequenceDiagram of at most ${SEQUENCE_MAX_ACTORS} participants.`,
    output: '{"kind": "sequence", "text": "sequenceDiagram\\n  participant Git\\n  Git->>CLI: post-commit"}',
    validate(text) {
      const source = text.trim();
      if (!/^sequenceDiagram\b/.test(source)) return false;
      if (/<script/i.test(source)) return false;
      if (!/-{1,2}>>?|-[x)]/.test(source)) return false;
      if (source.split("\n").length > 40) return false;
      return sequenceActors(source) <= SEQUENCE_MAX_ACTORS;
    }
  },
  {
    kind: "interface",
    name: "Interface",
    when: `The change adds, removes or changes something other code or people call: a CLI command or flag, an exported function's signature, a config key, a schema field, an HTTP route. One row per item: the item, what it was, what it is now; "\u2014" for nothing.`,
    output: `{"kind": "interface", "text": "cogit shape --commit <sha> | \u2014 | shapes the message the commit's trailer names"}`,
    validate(text) {
      const rows = tableRows(text);
      return rows !== void 0 && rows.length >= 1 && rows.length <= TABLE_MAX_ROWS;
    }
  },
  {
    kind: "example",
    name: "Example",
    when: 'The behaviour is easiest to grasp from one concrete case: a command and what it prints, an input and the output, a situation and what now happens. Real values from the diff, each step on its own line, "\u2192" before each result.',
    output: '{"kind": "example", "text": "git commit (message not recorded yet)\\n\u2192 queued ba654e8 until h72a65f6220b4 is recorded"}',
    validate(text) {
      const lines = text.split("\n").filter((line) => line.trim() !== "");
      return lines.length >= 2 && lines.length <= 12 && text.includes("\u2192") && text.length <= 1500;
    }
  }
];
function sequenceActors(text) {
  const actors = /* @__PURE__ */ new Set();
  for (const line of text.split("\n")) {
    const declared = /^\s*(?:participant|actor)\s+([^\s:]+)/.exec(line);
    if (declared?.[1]) actors.add(declared[1]);
    const message = /^\s*([^\s:-][^:]*?)\s*-{1,2}(?:>>|>|x|\))[+-]?\s*([^:]+?)\s*:/.exec(line);
    if (message?.[1] && message[2]) {
      actors.add(message[1]);
      actors.add(message[2]);
    }
  }
  return actors.size;
}
var TABLE_MAX_ROWS = 8;
function shapeToolSpec(kind) {
  return SHAPE_TOOLS.find((tool) => tool.kind === kind);
}
function validateShapeTools(tools) {
  return tools.map((tool) => {
    const spec = shapeToolSpec(tool.kind);
    return { kind: tool.kind, text: tool.text, valid: spec?.validate(tool.text) ?? false };
  });
}
function stampShape(shape, by, at) {
  return {
    tools: validateShapeTools(shape.tools),
    commits: [...new Set(shape.commits)],
    by,
    at
  };
}
var SKIP_FILES = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|poetry\.lock|Pipfile\.lock|composer\.lock|go\.sum|CHANGELOG\.md|VERSION)$/i;
var RELEASE_FILES = /(^|\/)(package\.json|VERSION|CHANGELOG\.md)$/i;
var RELEASE_SUBJECT = /^(chore\(release\)|release\b|v?\d+\.\d+\.\d+\b)/i;
var SHAPE_MIN_LINES = 5;
function releaseCommit(commit) {
  if (commit.files.length === 0) return /^chore\(release\)/i.test(commit.subject ?? "");
  if (commit.files.every((file) => SKIP_FILES.test(file))) return true;
  return commit.files.every((file) => RELEASE_FILES.test(file)) && RELEASE_SUBJECT.test(commit.subject ?? "");
}
function shapeWanted(commits) {
  if (commits.length === 0) return { wanted: false, reason: "no commits" };
  const lines = commits.reduce((sum, commit) => sum + commit.added + commit.removed, 0);
  if (lines < SHAPE_MIN_LINES)
    return { wanted: false, reason: `only ${lines} changed line${lines === 1 ? "" : "s"}` };
  if (commits.every(releaseCommit))
    return { wanted: false, reason: "release, lockfile or changelog changes only" };
  return { wanted: true, reason: "" };
}
var SHAPE_DIFF_LIMIT = 7e3;
function toolCatalogue() {
  return SHAPE_TOOLS.map(
    (tool) => `- "${tool.kind}" (${tool.name}): ${tool.when}
  Output: ${tool.output}`
  ).join("\n");
}
function intentLines(node) {
  const lines = [`Title: ${node.title}`];
  if (node.why) lines.push(`Why: ${node.why}`);
  if (node.alternatives?.length)
    lines.push(
      `Rejected: ${node.alternatives.map((alt) => `${alt.option}${alt.why ? ` (${alt.why})` : ""}`).join("; ")}`
    );
  if (node.work?.length) lines.push(`Work: ${node.work.join("; ")}`);
  if (node.agentDecisions?.length)
    lines.push(
      `Agent decisions: ${node.agentDecisions.map((decision) => decision.title).join("; ")}`
    );
  return lines;
}
function shapePrompt(opts) {
  const writing = opts.language === "auto" ? "the conversation's language" : opts.language;
  const commitLines = opts.commits.map(
    (commit) => `- ${commit.hash.slice(0, 7)} ${commit.subject ?? ""} (+${commit.added} \u2212${commit.removed}): ${commit.files.join(", ")}`
  );
  return [
    "You write the Shape of one message in a cogit lineage record: a small representation of what its change does at a glance, so a reviewer can see the intent, the shape and the code in that order.",
    "You get the Intent (from the record) and the Code (the commits and their diff). Write the Shape between them.",
    "",
    "Tools:",
    toolCatalogue(),
    "",
    "Rules:",
    "- Give at most three tools, the ones that say the most about this change; never two that tell the same thing.",
    "- A diagram for a change across two or more files: a sequence diagram when work is handed between actors over time, a flowchart for a path through code.",
    "- A Before / After table when behaviour someone can see changes (a fix, a new default, a rule). A pure refactor takes none.",
    "- An Interface table only for what is reached from outside the changed module: a CLI command or flag, an exported function or type other packages use, a config key, a stored schema field, an HTTP route. Never an internal helper, a component prop or a view-model field.",
    "- A new or changed command or flag always gets an example that runs it and shows what it prints, with real values from the diff. Otherwise an example only when one concrete case shows the change faster than steps.",
    "- Steps only when the logic itself is the point and no other tool says it.",
    "- Tables have no header row (the map adds one); every line is one row of three cells split by |.",
    "- Order the tools: diagram, tables, example, steps. Return none when the change is a small fix not worth a picture.",
    `- Name real functions, files and modules from the diff. Never invent a path.`,
    `- A flowchart starts with "flowchart TD" (or LR) and stays under ${MERMAID_MAX_NODES} nodes; quote labels that hold spaces or punctuation. A sequence diagram starts with "sequenceDiagram", names at most ${SEQUENCE_MAX_ACTORS} participants with short ids, and puts no semicolons or # in message text.`,
    "- Describe what the code does now, not the steps of the conversation.",
    `- Write the text in ${writing}; JSON keys stay English. Never write secrets, credentials or personal data.`,
    "",
    "Intent:",
    ...intentLines(opts.node),
    "",
    "Commits:",
    ...commitLines,
    "",
    `Diff${opts.diffTruncated ? " (cut to fit; the commits above are complete)" : ""}:`,
    opts.diff,
    "",
    'Return only one JSON object, no code fences: {"tools": [{"kind": "pseudo", "text": "1. ...\\n2. ..."}]}. Return {"tools": []} when nothing here is worth showing.'
  ].join("\n");
}
function parseShapeAnswer(text) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1] ?? text;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) return void 0;
  let parsed2;
  try {
    parsed2 = JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return void 0;
  }
  if (typeof parsed2 !== "object" || parsed2 === null) return void 0;
  const tools = parsed2.tools;
  if (!Array.isArray(tools)) return void 0;
  const known = [];
  for (const tool of tools) {
    if (typeof tool !== "object" || tool === null) continue;
    const { kind, text: body } = tool;
    if (typeof kind !== "string" || typeof body !== "string") continue;
    if (shapeToolSpec(kind) === void 0) continue;
    if (body.trim() === "" || body.length > 4e3) continue;
    known.push({ kind, text: body });
  }
  return { tools: known.slice(0, 3), commits: [] };
}

// src/shape-queue.ts
import { mkdir, readdir, readFile, rm, stat, writeFile } from "fs/promises";
import { join } from "path";
var FULL_HASH = /^[0-9a-f]{40}$/;
var QUEUE_MAX_AGE_MS = 7 * 24 * 36e5;
async function enqueueShape(root, commit, thought) {
  const dir = projectPaths(root).shapeQueue;
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, commit), `${thought}
`);
}
async function dequeueShape(root, commit) {
  await rm(join(projectPaths(root).shapeQueue, commit), { force: true });
}
async function queuedShapes(root, now = /* @__PURE__ */ new Date()) {
  const dir = projectPaths(root).shapeQueue;
  const names = await readdir(dir).catch(() => []);
  const out = [];
  for (const name of names) {
    if (!FULL_HASH.test(name)) continue;
    const file = join(dir, name);
    const info = await stat(file).catch(() => void 0);
    if (info === void 0) continue;
    if (now.getTime() - info.mtimeMs > QUEUE_MAX_AGE_MS) {
      await rm(file, { force: true });
      continue;
    }
    const thought = (await readFile(file, "utf8").catch(() => "")).trim();
    if (thought !== "") out.push({ commit: name, thought });
  }
  return out;
}
function readyShapes(queue, session) {
  const ids = new Set(session.nodes.filter((n) => n.kind === "message").map((n) => n.id));
  return queue.filter((entry) => ids.has(entry.thought));
}
async function drainShapeQueue(root, session, env, cli, spawn5 = spawnDetachedProcess) {
  if (cli === void 0) return 0;
  const ready = readyShapes(await queuedShapes(root), session);
  for (const entry of ready) {
    spawn5(
      cli,
      ["shape", "--commit", entry.commit, "-C", root],
      env,
      projectPaths(root).detachedLog
    );
  }
  return ready.length;
}

// src/commands/build.ts
import { readdir as readdir2, stat as stat2 } from "fs/promises";
import { dirname, resolve as resolve2 } from "path";

// src/store/map-view.ts
var MAP_VIEW_SCHEMA = 1;
var SESSION_ID = /^[A-Za-z0-9._:-]{1,128}$/;
var MAX_WIDTH = 1e4;
var MAX_OPEN = 500;
var MapView = external_exports.object({
  schema: external_exports.literal(MAP_VIEW_SCHEMA),
  /** Session id → the message rows' width in map pixels. */
  rowWidths: external_exports.record(external_exports.string(), external_exports.number().int().positive().max(MAX_WIDTH)).default({}),
  /** Sessions open on the map, in the order the page sent them. */
  open: external_exports.array(external_exports.string().regex(SESSION_ID)).max(MAX_OPEN).default([])
});
async function readMapView(root) {
  const read = await readJson(projectPaths(root).mapView);
  const empty = { schema: MAP_VIEW_SCHEMA, rowWidths: {}, open: [] };
  if (!read.found || "error" in read) return empty;
  const parsed2 = MapView.safeParse(read.value);
  return parsed2.success ? parsed2.data : empty;
}
async function updateMapView(root, change) {
  const paths = projectPaths(root);
  await withLock(
    paths.lock("map-view"),
    async () => {
      const view = await readMapView(root);
      change(view);
      const rowWidths = Object.fromEntries(
        Object.entries(view.rowWidths).sort(([a], [b]) => a.localeCompare(b))
      );
      await atomicWriteJson(paths.mapView, { schema: MAP_VIEW_SCHEMA, rowWidths, open: view.open });
    },
    { timeoutMs: 2e3 }
  );
}
async function setRowWidth(root, sessionId, width) {
  if (!SESSION_ID.test(sessionId)) throw new Error(`not a session id: ${sessionId}`);
  if (width !== null && !(Number.isInteger(width) && width > 0 && width <= MAX_WIDTH))
    throw new Error(`not a row width: ${width}`);
  await updateMapView(root, (view) => {
    if (width === null) delete view.rowWidths[sessionId];
    else view.rowWidths[sessionId] = width;
  });
}
async function setOpenSessions(root, open) {
  if (open.length > MAX_OPEN) throw new Error(`too many open sessions: ${open.length}`);
  for (const sessionId of open)
    if (!SESSION_ID.test(sessionId)) throw new Error(`not a session id: ${sessionId}`);
  await updateMapView(root, (view) => {
    view.open = [...new Set(open)];
  });
}

// src/view/panel.ts
import { pathToFileURL } from "url";

// src/store/inbox-state.ts
var INBOX_STATE_SCHEMA = 1;
var SESSION_ID2 = /^[A-Za-z0-9._:-]{1,128}$/;
var InboxState = external_exports.object({
  schema: external_exports.literal(INBOX_STATE_SCHEMA),
  /** Session id → the ISO turn time the user dismissed. */
  dismissed: external_exports.record(external_exports.string(), IsoDate).default({})
});
async function readInboxDismissed(root) {
  const read = await readJson(projectPaths(root).inboxState);
  if (!read.found || "error" in read) return /* @__PURE__ */ new Map();
  const parsed2 = InboxState.safeParse(read.value);
  return new Map(parsed2.success ? Object.entries(parsed2.data.dismissed) : []);
}
async function dismissInboxSession(root, sessionId, at) {
  if (!SESSION_ID2.test(sessionId)) throw new Error(`not a session id: ${sessionId}`);
  const stamp2 = Date.parse(at);
  if (Number.isNaN(stamp2)) throw new Error(`not a time: ${at}`);
  const paths = projectPaths(root);
  await withLock(
    paths.lock("inbox-state"),
    async () => {
      const dismissed = await readInboxDismissed(root);
      dismissed.set(sessionId, at);
      const sorted = Object.fromEntries([...dismissed].sort(([a], [b]) => a.localeCompare(b)));
      await atomicWriteJson(paths.inboxState, {
        schema: INBOX_STATE_SCHEMA,
        dismissed: sorted
      });
    },
    { timeoutMs: 2e3 }
  );
}

// src/view/inbox.ts
var INBOX_MESSAGE_LIMIT = 300;
var INBOX_PENDING_LIMIT = 5;
function dismissKey(projectPath, sessionId) {
  return `${projectPath}\0${sessionId}`;
}
var DAY_MS = 24 * 60 * 60 * 1e3;
function parsed(iso) {
  if (iso === null) return Number.NEGATIVE_INFINITY;
  const time2 = Date.parse(iso);
  return Number.isNaN(time2) ? Number.NEGATIVE_INFINITY : time2;
}
function clipMessage(text, limit = INBOX_MESSAGE_LIMIT) {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}\u2026`;
}
var FENCE = /^\s{0,3}(?:`{3,}|~{3,})/;
var HEADING = /^\s{0,3}#{1,6}(?:\s+|$)/;
var HEADING_CLOSE = /\s+#+\s*$/;
var QUOTE = /^(?:\s{0,3}>\s?)+/;
var RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
var LIST = /^\s{0,3}(?:[-*+]|\d{1,9}[.)])\s+/;
var TASK = /^\[[ xX]\]\s+/;
function stripInline(line) {
  let text = line;
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  text = text.replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1");
  text = text.replace(/<(https?:\/\/[^>\s]+)>/g, "$1");
  text = text.replace(/`+/g, "");
  text = text.replace(/(\*\*\*|___)(?=\S)([\s\S]*?\S)\1/g, "$2");
  text = text.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2");
  text = text.replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1");
  text = text.replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g, "$1$2");
  text = text.replace(/(^|[^\w_])_(?=\S)([^_\n]*?\S)_(?![\w_])/g, "$1$2");
  text = text.replace(/\*\*/g, "").replace(/~~/g, "");
  return text;
}
function stripLine(line) {
  if (RULE.test(line)) return "";
  let text = line.replace(HEADING, "").replace(QUOTE, "");
  text = text.replace(LIST, "").replace(TASK, "");
  return stripInline(text.replace(HEADING_CLOSE, ""));
}
function stripMarkdown(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let inFence = false;
  for (const line of lines) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      out.push("");
      continue;
    }
    out.push(inFence ? line : stripLine(line));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
function inboxRows(candidates, dismissed, now, maxAgeDays) {
  const cutoff = Date.parse(now) - maxAgeDays * DAY_MS;
  const rows = [];
  for (const candidate of candidates) {
    const turnAt = candidate.turn?.at ?? null;
    const at = turnAt ?? candidate.lastActivity;
    if (at === null) continue;
    const atMs = parsed(at);
    if (atMs === Number.NEGATIVE_INFINITY) continue;
    if (!Number.isNaN(cutoff) && atMs < cutoff) continue;
    const dismissedAt = dismissed.get(dismissKey(candidate.projectPath, candidate.sessionId));
    if (dismissedAt !== void 0 && parsed(dismissedAt) >= atMs) continue;
    const signal = turnAt !== null && candidate.needsUser.length > 0 ? "both" : turnAt !== null ? "turn" : "record";
    rows.push({
      projectName: candidate.projectName,
      projectPath: candidate.projectPath,
      mapUrl: candidate.mapUrl,
      sessionId: candidate.sessionId,
      sessionTitle: candidate.sessionTitle,
      signal,
      at,
      ...turnAt !== null && candidate.turn !== null ? { lastMessage: clipMessage(stripMarkdown(candidate.turn.text)) } : {},
      goal: candidate.goal,
      lastDecision: candidate.lastDecision,
      pending: candidate.pending,
      ...candidate.messageId === null ? {} : { messageId: candidate.messageId },
      transcriptAvailable: candidate.transcriptAvailable
    });
  }
  rows.sort(compareInboxRows);
  return rows;
}
function compareInboxRows(a, b) {
  return parsed(a.at) - parsed(b.at) || a.projectName.localeCompare(b.projectName) || a.projectPath.localeCompare(b.projectPath) || a.sessionId.localeCompare(b.sessionId);
}

// ../template/dist/index.html
var dist_default = '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>cogit \u2014 map</title>\n    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 64 64\' role=\'img\' aria-label=\'cogit\'%3E%3Cpath fill=\'none\' stroke=\'%237aa2f7\' stroke-width=\'5\' stroke-linecap=\'round\' d=\'M47 18 C42 12 35 10 29 11 C17 13 10 23 11 34 C12 46 22 54 33 53 C39 52.6 44 50 47 46\'/%3E%3Cpath fill=\'none\' stroke=\'%239ece6a\' stroke-width=\'3.6\' stroke-linecap=\'round\' d=\'M15.5 21.5 C24 24 27 29 27 34 C27 39 24 44 15.5 46.5\'/%3E%3Ccircle cx=\'29\' cy=\'11\' r=\'4.4\' fill=\'%237aa2f7\'/%3E%3Ccircle cx=\'11\' cy=\'34\' r=\'4.4\' fill=\'%237aa2f7\'/%3E%3Ccircle cx=\'33\' cy=\'53\' r=\'4.4\' fill=\'%237aa2f7\'/%3E%3Ccircle cx=\'27\' cy=\'34\' r=\'4.2\' fill=\'%239ece6a\'/%3E%3C/svg%3E" />\n    <script type="module" crossorigin>var e=Object.create,t=Object.defineProperty,n=Object.getOwnPropertyDescriptor,r=Object.getOwnPropertyNames,i=Object.getPrototypeOf,a=Object.prototype.hasOwnProperty,o=(e,t)=>()=>(t||(e((t={exports:{}}).exports,t,t.exports),e=null),t.exports),s=(e,i,o,s)=>{if(i&&typeof i==`object`||typeof i==`function`)for(var c=r(i),l=0,u=c.length,d;l<u;l++)d=c[l],!a.call(e,d)&&d!==o&&t(e,d,{get:(e=>i[e]).bind(null,d),enumerable:!(s=n(i,d))||s.enumerable});return e},c=(n,r,o)=>(o=n==null?{}:e(i(n)),s(r||!n||!n.__esModule||!a.call(n,`default`)?t(o,`default`,{value:n,enumerable:!0}):o,n));(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),t.credentials=e.crossOrigin===`use-credentials`?`include`:e.crossOrigin===`anonymous`?`omit`:`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var l=o((e=>{var t=Symbol.for(`react.transitional.element`),n=Symbol.for(`react.portal`),r=Symbol.for(`react.fragment`),i=Symbol.for(`react.strict_mode`),a=Symbol.for(`react.profiler`),o=Symbol.for(`react.consumer`),s=Symbol.for(`react.context`),c=Symbol.for(`react.forward_ref`),l=Symbol.for(`react.suspense`),u=Symbol.for(`react.memo`),d=Symbol.for(`react.lazy`),f=Symbol.for(`react.activity`),p=Symbol.for(`react.view_transition`),m=Symbol.iterator;function h(e){return typeof e!=`object`||!e?null:(e=m&&e[m]||e[`@@iterator`],typeof e==`function`?e:null)}var g={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},_=Object.assign,v={};function y(e,t,n){this.props=e,this.context=t,this.refs=v,this.updater=n||g}y.prototype.isReactComponent={},y.prototype.setState=function(e,t){if(typeof e!=`object`&&typeof e!=`function`&&e!=null)throw Error(`takes an object of state variables to update or a function which returns an object of state variables.`);this.updater.enqueueSetState(this,e,t,`setState`)},y.prototype.forceUpdate=function(e){this.updater.enqueueForceUpdate(this,e,`forceUpdate`)};function b(){}b.prototype=y.prototype;function x(e,t,n){this.props=e,this.context=t,this.refs=v,this.updater=n||g}var S=x.prototype=new b;S.constructor=x,_(S,y.prototype),S.isPureReactComponent=!0;var C=Array.isArray;function w(){}var T={H:null,A:null,T:null,S:null},E=Object.prototype.hasOwnProperty;function D(e,n,r){var i=r.ref;return{$$typeof:t,type:e,key:n,ref:i===void 0?null:i,props:r}}function O(e,t){return D(e.type,t,e.props)}function k(e){return typeof e==`object`&&!!e&&e.$$typeof===t}function A(e){var t={"=":`=0`,":":`=2`};return`$`+e.replace(/[=:]/g,function(e){return t[e]})}var j=/\\/+/g;function ee(e,t){return typeof e==`object`&&e&&e.key!=null?A(``+e.key):t.toString(36)}function te(e){switch(e.status){case`fulfilled`:return e.value;case`rejected`:throw e.reason;default:switch(typeof e.status==`string`?e.then(w,w):(e.status=`pending`,e.then(function(t){e.status===`pending`&&(e.status=`fulfilled`,e.value=t)},function(t){e.status===`pending`&&(e.status=`rejected`,e.reason=t)})),e.status){case`fulfilled`:return e.value;case`rejected`:throw e.reason}}throw e}function M(e,r,i,a,o){var s=typeof e;(s===`undefined`||s===`boolean`)&&(e=null);var c=!1;if(e===null)c=!0;else switch(s){case`bigint`:case`string`:case`number`:c=!0;break;case`object`:switch(e.$$typeof){case t:case n:c=!0;break;case d:return c=e._init,M(c(e._payload),r,i,a,o)}}if(c)return o=o(e),c=a===``?`.`+ee(e,0):a,C(o)?(i=``,c!=null&&(i=c.replace(j,`$&/`)+`/`),M(o,r,i,``,function(e){return e})):o!=null&&(k(o)&&(o=O(o,i+(o.key==null||e&&e.key===o.key?``:(``+o.key).replace(j,`$&/`)+`/`)+c)),r.push(o)),1;c=0;var l=a===``?`.`:a+`:`;if(C(e))for(var u=0;u<e.length;u++)a=e[u],s=l+ee(a,u),c+=M(a,r,i,s,o);else if(u=h(e),typeof u==`function`)for(e=u.call(e),u=0;!(a=e.next()).done;)a=a.value,s=l+ee(a,u++),c+=M(a,r,i,s,o);else if(s===`object`){if(typeof e.then==`function`)return M(te(e),r,i,a,o);throw r=String(e),Error(`Objects are not valid as a React child (found: `+(r===`[object Object]`?`object with keys {`+Object.keys(e).join(`, `)+`}`:r)+`). If you meant to render a collection of children, use an array instead.`)}return c}function N(e,t,n){if(e==null)return e;var r=[],i=0;return M(e,r,``,``,function(e){return t.call(n,e,i++)}),r}function ne(e){if(e._status===-1){var t=e._result,n=t();n.then(function(t){(e._status===0||e._status===-1)&&(e._status=1,e._result=t,n.status===void 0&&(n.status=`fulfilled`,n.value=t))},function(t){(e._status===0||e._status===-1)&&(e._status=2,e._result=t,n.status===void 0&&(n.status=`rejected`,n.reason=t))}),e._status===-1&&(e._status=0,e._result=n)}if(e._status===1)return e._result.default;throw e._result}var re=typeof reportError==`function`?reportError:function(e){if(typeof window==`object`&&typeof window.ErrorEvent==`function`){var t=new window.ErrorEvent(`error`,{bubbles:!0,cancelable:!0,message:typeof e==`object`&&e&&typeof e.message==`string`?String(e.message):String(e),error:e});if(!window.dispatchEvent(t))return}else if(typeof process==`object`&&typeof process.emit==`function`){process.emit(`uncaughtException`,e);return}console.error(e)};function ie(e){var t=T.T,n={};n.types=t===null?null:t.types,T.T=n;try{var r=e(),i=T.S;i!==null&&i(n,r),typeof r==`object`&&r&&typeof r.then==`function`&&r.then(w,re)}catch(e){re(e)}finally{t!==null&&n.types!==null&&(t.types=n.types),T.T=t}}function P(e){var t=T.T;if(t!==null){var n=t.types;n===null?t.types=[e]:n.indexOf(e)===-1&&n.push(e)}else ie(P.bind(null,e))}var ae={map:N,forEach:function(e,t,n){N(e,function(){t.apply(this,arguments)},n)},count:function(e){var t=0;return N(e,function(){t++}),t},toArray:function(e){return N(e,function(e){return e})||[]},only:function(e){if(!k(e))throw Error(`React.Children.only expected to receive a single React element child.`);return e}};e.Activity=f,e.Children=ae,e.Component=y,e.Fragment=r,e.Profiler=a,e.PureComponent=x,e.StrictMode=i,e.Suspense=l,e.ViewTransition=p,e.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=T,e.__COMPILER_RUNTIME={__proto__:null,c:function(e){return T.H.useMemoCache(e)}},e.addTransitionType=P,e.cache=function(e){return function(){return e.apply(null,arguments)}},e.cacheSignal=function(){return null},e.cloneElement=function(e,t,n){if(e==null)throw Error(`The argument must be a React element, but you passed `+e+`.`);var r=_({},e.props),i=e.key;if(t!=null)for(a in t.key!==void 0&&(i=``+t.key),t)!E.call(t,a)||a===`key`||a===`__self`||a===`__source`||a===`ref`&&t.ref===void 0||(r[a]=t[a]);var a=arguments.length-2;if(a===1)r.children=n;else if(1<a){for(var o=Array(a),s=0;s<a;s++)o[s]=arguments[s+2];r.children=o}return D(e.type,i,r)},e.createContext=function(e){return e={$$typeof:s,_currentValue:e,_currentValue2:e,_threadCount:0,Provider:null,Consumer:null},e.Provider=e,e.Consumer={$$typeof:o,_context:e},e},e.createElement=function(e,t,n){var r,i={},a=null;if(t!=null)for(r in t.key!==void 0&&(a=``+t.key),t)E.call(t,r)&&r!==`key`&&r!==`__self`&&r!==`__source`&&(i[r]=t[r]);var o=arguments.length-2;if(o===1)i.children=n;else if(1<o){for(var s=Array(o),c=0;c<o;c++)s[c]=arguments[c+2];i.children=s}if(e&&e.defaultProps)for(r in o=e.defaultProps,o)i[r]===void 0&&(i[r]=o[r]);return D(e,a,i)},e.createRef=function(){return{current:null}},e.forwardRef=function(e){return{$$typeof:c,render:e}},e.isValidElement=k,e.lazy=function(e){return{$$typeof:d,_payload:{_status:-1,_result:e},_init:ne}},e.memo=function(e,t){return{$$typeof:u,type:e,compare:t===void 0?null:t}},e.startTransition=ie,e.unstable_useCacheRefresh=function(){return T.H.useCacheRefresh()},e.use=function(e){return T.H.use(e)},e.useActionState=function(e,t,n){return T.H.useActionState(e,t,n)},e.useCallback=function(e,t){return T.H.useCallback(e,t)},e.useContext=function(e){return T.H.useContext(e)},e.useDebugValue=function(){},e.useDeferredValue=function(e,t){return T.H.useDeferredValue(e,t)},e.useEffect=function(e,t){return T.H.useEffect(e,t)},e.useEffectEvent=function(e){return T.H.useEffectEvent(e)},e.useId=function(){return T.H.useId()},e.useImperativeHandle=function(e,t,n){return T.H.useImperativeHandle(e,t,n)},e.useInsertionEffect=function(e,t){return T.H.useInsertionEffect(e,t)},e.useLayoutEffect=function(e,t){return T.H.useLayoutEffect(e,t)},e.useMemo=function(e,t){return T.H.useMemo(e,t)},e.useOptimistic=function(e,t){return T.H.useOptimistic(e,t)},e.useReducer=function(e,t,n){return T.H.useReducer(e,t,n)},e.useRef=function(e){return T.H.useRef(e)},e.useState=function(e){return T.H.useState(e)},e.useSyncExternalStore=function(e,t,n){return T.H.useSyncExternalStore(e,t,n)},e.useTransition=function(){return T.H.useTransition()},e.version=`19.3.1`})),u=o(((e,t)=>{t.exports=l()})),d=o((e=>{function t(e,t){var n=e.length;e.push(t);a:for(;0<n;){var r=n-1>>>1,a=e[r];if(0<i(a,t))e[r]=t,e[n]=a,n=r;else break a}}function n(e){return e.length===0?null:e[0]}function r(e){if(e.length===0)return null;var t=e[0],n=e.pop();if(n!==t){e[0]=n;a:for(var r=0,a=e.length,o=a>>>1;r<o;){var s=2*(r+1)-1,c=e[s],l=s+1,u=e[l];if(0>i(c,n))l<a&&0>i(u,c)?(e[r]=u,e[l]=n,r=l):(e[r]=c,e[s]=n,r=s);else if(l<a&&0>i(u,n))e[r]=u,e[l]=n,r=l;else break a}}return t}function i(e,t){var n=e.sortIndex-t.sortIndex;return n===0?e.id-t.id:n}if(e.unstable_now=void 0,typeof performance==`object`&&typeof performance.now==`function`){var a=performance;e.unstable_now=function(){return a.now()}}else{var o=Date,s=o.now();e.unstable_now=function(){return o.now()-s}}var c=[],l=[],u=1,d=null,f=3,p=!1,m=!1,h=!1,g=!1,_=typeof setTimeout==`function`?setTimeout:null,v=typeof clearTimeout==`function`?clearTimeout:null,y=typeof setImmediate<`u`?setImmediate:null;function b(e){for(var i=n(l);i!==null;){if(i.callback===null)r(l);else if(i.startTime<=e)r(l),i.sortIndex=i.expirationTime,t(c,i);else break;i=n(l)}}function x(e){if(h=!1,b(e),!m){if(n(c)!==null)m=!0,S||(S=!0,O());else{var t=n(l);t!==null&&j(x,t.startTime-e)}}}var S=!1,C=-1,w=5,T=-1;function E(){return g?!0:!(e.unstable_now()-T<w)}function D(){if(g=!1,S){var t=e.unstable_now();T=t;var i=!0;try{a:{m=!1,h&&(h=!1,v(C),C=-1),p=!0;var a=f;try{b:{for(b(t),d=n(c);d!==null&&!(d.expirationTime>t&&E());){var o=d.callback;if(typeof o==`function`){d.callback=null,f=d.priorityLevel;var s=o(d.expirationTime<=t);if(t=e.unstable_now(),typeof s==`function`){d.callback=s,b(t),i=!0;break b}d===n(c)&&r(c),b(t)}else r(c);d=n(c)}if(d!==null)i=!0;else{var u=n(l);u!==null&&j(x,u.startTime-t),i=!1}}break a}finally{d=null,f=a,p=!1}i=void 0}}finally{i?O():S=!1}}}var O;if(typeof y==`function`)O=function(){y(D)};else if(typeof MessageChannel<`u`){var k=new MessageChannel,A=k.port2;k.port1.onmessage=D,O=function(){A.postMessage(null)}}else O=function(){_(D,0)};function j(t,n){C=_(function(){t(e.unstable_now())},n)}e.unstable_IdlePriority=5,e.unstable_ImmediatePriority=1,e.unstable_LowPriority=4,e.unstable_NormalPriority=3,e.unstable_Profiling=null,e.unstable_UserBlockingPriority=2,e.unstable_cancelCallback=function(e){e.callback=null},e.unstable_forceFrameRate=function(e){0>e||125<e?console.error(`forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported`):w=0<e?Math.floor(1e3/e):5},e.unstable_getCurrentPriorityLevel=function(){return f},e.unstable_next=function(e){switch(f){case 1:case 2:case 3:var t=3;break;default:t=f}var n=f;f=t;try{return e()}finally{f=n}},e.unstable_requestPaint=function(){g=!0},e.unstable_runWithPriority=function(e,t){switch(e){case 1:case 2:case 3:case 4:case 5:break;default:e=3}var n=f;f=e;try{return t()}finally{f=n}},e.unstable_scheduleCallback=function(r,i,a){var o=e.unstable_now();switch(typeof a==`object`&&a?(a=a.delay,a=typeof a==`number`&&0<a?o+a:o):a=o,r){case 1:var s=-1;break;case 2:s=250;break;case 5:s=1073741823;break;case 4:s=1e4;break;default:s=5e3}return s=a+s,r={id:u++,callback:i,priorityLevel:r,startTime:a,expirationTime:s,sortIndex:-1},a>o?(r.sortIndex=a,t(l,r),n(c)===null&&r===n(l)&&(h?(v(C),C=-1):h=!0,j(x,a-o))):(r.sortIndex=s,t(c,r),m||p||(m=!0,S||(S=!0,O()))),r},e.unstable_shouldYield=E,e.unstable_wrapCallback=function(e){var t=f;return function(){var n=f;f=t;try{return e.apply(this,arguments)}finally{f=n}}}})),f=o(((e,t)=>{t.exports=d()})),p=o((e=>{var t=u();function n(e){var t=`https://react.dev/errors/`+e;if(1<arguments.length){t+=`?args[]=`+encodeURIComponent(arguments[1]);for(var n=2;n<arguments.length;n++)t+=`&args[]=`+encodeURIComponent(arguments[n])}return`Minified React error #`+e+`; visit `+t+` for the full message or use the non-minified dev environment for full errors and additional helpful warnings.`}function r(){}var i={d:{f:r,r:function(){throw Error(n(522))},D:r,C:r,L:r,m:r,X:r,S:r,M:r},p:0,findDOMNode:null},a=Symbol.for(`react.portal`),o=Symbol.for(`react.recoverable`),s=Symbol.for(`react.optimistic_key`);function c(e,t,n){var r=3<arguments.length&&arguments[3]!==void 0?arguments[3]:null;return{$$typeof:a,key:r==null?null:r===s?s:``+r,children:e,containerInfo:t,implementation:n}}var l=t.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;function d(e,t){if(e===`font`)return``;if(typeof t==`string`)return t===`use-credentials`?t:``}e.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE=i,e.browser=function(e){return{$$typeof:o,_reason:e}},e.createPortal=function(e,t){var r=2<arguments.length&&arguments[2]!==void 0?arguments[2]:null;if(!t||t.nodeType!==1&&t.nodeType!==9&&t.nodeType!==11)throw Error(n(299));return c(e,t,null,r)},e.flushSync=function(e){var t=l.T,n=i.p;try{if(l.T=null,i.p=2,e)return e()}finally{l.T=t,i.p=n,i.d.f()}},e.preconnect=function(e,t){typeof e==`string`&&(t?(t=t.crossOrigin,t=typeof t==`string`?t===`use-credentials`?t:``:void 0):t=null,i.d.C(e,t))},e.prefetchDNS=function(e){typeof e==`string`&&i.d.D(e)},e.preinit=function(e,t){if(typeof e==`string`&&t&&typeof t.as==`string`){var n=t.as,r=d(n,t.crossOrigin),a=typeof t.integrity==`string`?t.integrity:void 0,o=typeof t.fetchPriority==`string`?t.fetchPriority:void 0;n===`style`?i.d.S(e,typeof t.precedence==`string`?t.precedence:void 0,{crossOrigin:r,integrity:a,fetchPriority:o}):n===`script`&&i.d.X(e,{crossOrigin:r,integrity:a,fetchPriority:o,nonce:typeof t.nonce==`string`?t.nonce:void 0})}},e.preinitModule=function(e,t){if(typeof e==`string`){if(typeof t==`object`&&t){if(t.as==null||t.as===`script`){var n=d(t.as,t.crossOrigin);i.d.M(e,{crossOrigin:n,integrity:typeof t.integrity==`string`?t.integrity:void 0,nonce:typeof t.nonce==`string`?t.nonce:void 0,fetchPriority:typeof t.fetchPriority==`string`?t.fetchPriority:void 0})}}else t??i.d.M(e)}},e.preload=function(e,t){if(typeof e==`string`&&typeof t==`object`&&t&&typeof t.as==`string`){var n=t.as,r=d(n,t.crossOrigin);i.d.L(e,n,{crossOrigin:r,integrity:typeof t.integrity==`string`?t.integrity:void 0,nonce:typeof t.nonce==`string`?t.nonce:void 0,type:typeof t.type==`string`?t.type:void 0,fetchPriority:typeof t.fetchPriority==`string`?t.fetchPriority:void 0,referrerPolicy:typeof t.referrerPolicy==`string`?t.referrerPolicy:void 0,imageSrcSet:typeof t.imageSrcSet==`string`?t.imageSrcSet:void 0,imageSizes:typeof t.imageSizes==`string`?t.imageSizes:void 0,media:typeof t.media==`string`?t.media:void 0})}},e.preloadModule=function(e,t){if(typeof e==`string`){if(t){var n=d(t.as,t.crossOrigin);i.d.m(e,{as:typeof t.as==`string`&&t.as!==`script`?t.as:void 0,crossOrigin:n,integrity:typeof t.integrity==`string`?t.integrity:void 0,nonce:typeof t.nonce==`string`?t.nonce:void 0,fetchPriority:typeof t.fetchPriority==`string`?t.fetchPriority:void 0})}else i.d.m(e)}},e.requestFormReset=function(e){i.d.r(e)},e.unstable_batchedUpdates=function(e,t){return e(t)},e.useFormState=function(e,t,n){return l.H.useFormState(e,t,n)},e.useFormStatus=function(){return l.H.useHostTransitionStatus()},e.version=`19.3.1`})),m=o(((e,t)=>{function n(){if(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__<`u`&&typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE==`function`)try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n)}catch(e){console.error(e)}}n(),t.exports=p()})),h=o((e=>{var t=f(),n=u(),r=m();function i(e){var t=`https://react.dev/errors/`+e;if(1<arguments.length){t+=`?args[]=`+encodeURIComponent(arguments[1]);for(var n=2;n<arguments.length;n++)t+=`&args[]=`+encodeURIComponent(arguments[n])}return`Minified React error #`+e+`; visit `+t+` for the full message or use the non-minified dev environment for full errors and additional helpful warnings.`}function a(e){return!(!e||e.nodeType!==1&&e.nodeType!==9&&e.nodeType!==11)}function o(e){for(var t=e,n=t;n&&!n.alternate;)t=n,t.flags&4098&&(e=t.return),n=t.return;for(;t.return;)t=t.return;return t.tag===3?e:null}function s(e){if(e.tag===13){var t=e.memoizedState;if(t===null&&(e=e.alternate,e!==null&&(t=e.memoizedState)),t!==null)return t.dehydrated}return null}function c(e){if(e.tag===31){var t=e.memoizedState;if(t===null&&(e=e.alternate,e!==null&&(t=e.memoizedState)),t!==null)return t.dehydrated}return null}function l(e){if(o(e)!==e)throw Error(i(188))}function d(e){var t=e.alternate;if(!t){if(t=o(e),t===null)throw Error(i(188));return t===e?e:null}for(var n=e,r=t;;){var a=n.return;if(a===null)break;var s=a.alternate;if(s===null){if(r=a.return,r!==null){n=r;continue}break}if(a.child===s.child){for(s=a.child;s;){if(s===n)return l(a),e;if(s===r)return l(a),t;s=s.sibling}throw Error(i(188))}if(n.return!==r.return)n=a,r=s;else{for(var c=!1,u=a.child;u;){if(u===n){c=!0,n=a,r=s;break}if(u===r){c=!0,r=a,n=s;break}u=u.sibling}if(!c){for(u=s.child;u;){if(u===n){c=!0,n=s,r=a;break}if(u===r){c=!0,r=s,n=a;break}u=u.sibling}if(!c)throw Error(i(189))}}if(n.alternate!==r)throw Error(i(190))}if(n.tag!==3)throw Error(i(188));return n.stateNode.current===n?e:t}function p(e){var t=e.tag;if(t===5||t===26||t===27||t===6)return e;for(e=e.child;e!==null;){if(t=p(e),t!==null)return t;e=e.sibling}return null}function h(e,t,n,r,i,a){for(;e!==null;){if((e.tag===5||e.tag===27||e.tag===6)&&n(e,r,i,a)||(e.tag!==22||e.memoizedState===null)&&(t||e.tag!==5&&e.tag!==27)&&h(e.child,t,n,r,i,a))return!0;e=e.sibling}return!1}function g(e){for(e=e.return;e!==null;){if(e.tag===3||e.tag===5||e.tag===27)return e;e=e.return}return null}function _(e){var t=!1;for(e=e.return;e!==null&&(e.tag===4&&(t=!0),e.tag!==3&&e.tag!==5&&e.tag!==27);)e=e.return;return t}function v(e){var t=[null,null],n=g(e);return n===null||y(t,e,n.child,{foundSelf:!1}),t}function y(e,t,n,r){for(;n!==null;){if(n===t)r.foundSelf=!0;else if(n.tag===5||n.tag===27||n.tag===6){if(r.foundSelf)return e[1]=n,!0;e[0]=n}else if((n.tag!==22||n.memoizedState===null)&&y(e,t,n.child,r))return!0;n=n.sibling}return!1}function b(e){switch(e.tag){case 5:case 27:case 6:return e.stateNode;case 3:return e.stateNode.containerInfo;default:throw Error(i(559))}}var x=null,S=null;function C(e,t,n){return e===n||e===t&&(x=e,!0)}function w(e,t,n){return e===n?(S=e,!1):e===t&&(S!==null&&(x=e),!0)}function T(e){if(e===null)return null;do e=e===null?null:e.return;while(e&&e.tag!==5&&e.tag!==27&&e.tag!==3);return e||null}function E(e,t,n){for(var r=0,i=e;i;i=n(i))r++;i=0;for(var a=t;a;a=n(a))i++;for(;0<r-i;)e=n(e),r--;for(;0<i-r;)t=n(t),i--;for(;r--;){if(e===t||t!==null&&e===t.alternate)return e;e=n(e),t=n(t)}return null}var D=Object.assign,O=Symbol.for(`react.element`),k=Symbol.for(`react.transitional.element`),A=Symbol.for(`react.portal`),j=Symbol.for(`react.fragment`),ee=Symbol.for(`react.strict_mode`),te=Symbol.for(`react.profiler`),M=Symbol.for(`react.consumer`),N=Symbol.for(`react.context`),ne=Symbol.for(`react.forward_ref`),re=Symbol.for(`react.suspense`),ie=Symbol.for(`react.suspense_list`),P=Symbol.for(`react.memo`),ae=Symbol.for(`react.lazy`),oe=Symbol.for(`react.activity`),se=Symbol.for(`react.legacy_hidden`),ce=Symbol.for(`react.memo_cache_sentinel`),le=Symbol.for(`react.view_transition`),ue=Symbol.for(`react.recoverable`),de=Symbol.iterator;function fe(e){return typeof e!=`object`||!e?null:(e=de&&e[de]||e[`@@iterator`],typeof e==`function`?e:null)}var pe=Symbol.for(`react.client.reference`);function me(e){if(e==null)return null;if(typeof e==`function`)return e.$$typeof===pe?null:e.displayName||e.name||null;if(typeof e==`string`)return e;switch(e){case j:return`Fragment`;case te:return`Profiler`;case ee:return`StrictMode`;case re:return`Suspense`;case ie:return`SuspenseList`;case oe:return`Activity`;case le:return`ViewTransition`}if(typeof e==`object`)switch(e.$$typeof){case A:return`Portal`;case N:return e.displayName||`Context`;case M:return(e._context.displayName||`Context`)+`.Consumer`;case ne:var t=e.render;return e=e.displayName,e||=(e=t.displayName||t.name||``,e===``?`ForwardRef`:`ForwardRef(`+e+`)`),e;case P:return t=e.displayName||null,t===null?me(e.type)||`Memo`:t;case ae:t=e._payload,e=e._init;try{return me(e(t))}catch{}}return null}var he=Array.isArray,F=n.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,I=r.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,ge={pending:!1,data:null,method:null,action:null},_e=[],ve=-1;function ye(e){return{current:e}}function L(e){0>ve||(e.current=_e[ve],_e[ve]=null,ve--)}function R(e,t){ve++,_e[ve]=e.current,e.current=t}var be=ye(null),z=ye(null),xe=ye(null),Se=ye(null);function Ce(e,t){switch(R(xe,t),R(z,e),R(be,null),t.nodeType){case 9:case 11:e=(e=t.documentElement)&&(e=e.namespaceURI)?up(e):0;break;default:if(e=t.tagName,t=t.namespaceURI)t=up(t),e=dp(t,e);else switch(e){case`svg`:e=1;break;case`math`:e=2;break;default:e=0}}L(be),R(be,e)}function we(){L(be),L(z),L(xe)}function Te(e){var t=e.memoizedState;t!==null&&(sh._currentValue=t.memoizedState,R(Se,e)),t=be.current;var n=dp(t,e.type);t!==n&&(R(z,e),R(be,n))}function Ee(e){z.current===e&&(L(be),L(z)),Se.current===e&&(L(Se),sh._currentValue=ge)}var De,Oe;function ke(e){if(De===void 0)try{throw Error()}catch(e){var t=e.stack.trim().match(/\\n( *(at )?)/);De=t&&t[1]||``,Oe=-1<e.stack.indexOf(`\n    at`)?` (<anonymous>)`:-1<e.stack.indexOf(`@`)?`@unknown:0:0`:``}return`\n`+De+e+Oe}var Ae=!1;function je(e,t){if(!e||Ae)return``;Ae=!0;var n=Error.prepareStackTrace;Error.prepareStackTrace=void 0;try{var r={DetermineComponentFrameRoot:function(){try{if(t){var n=function(){throw Error()};if(Object.defineProperty(n.prototype,"props",{set:function(){throw Error()}}),typeof Reflect==`object`&&Reflect.construct){try{Reflect.construct(n,[])}catch(e){var r=e}Reflect.construct(e,[],n)}else{try{n.call()}catch(e){r=e}n=!1;try{var i=Object.getOwnPropertyDescriptor(e.prototype,`props`);Object.defineProperty(e.prototype,"props",{configurable:!0,set:function(){throw Error()}}),n=!0,new e}finally{n&&(i===void 0?delete e.prototype.props:Object.defineProperty(e.prototype,"props",i))}}}else{try{throw Error()}catch(e){r=e}(n=e())&&typeof n.catch==`function`&&n.catch(function(){})}}catch(e){if(e&&r&&typeof e.stack==`string`)return[e.stack,r.stack]}return[null,null]}};r.DetermineComponentFrameRoot.displayName=`DetermineComponentFrameRoot`;var i=Object.getOwnPropertyDescriptor(r.DetermineComponentFrameRoot,`name`);i&&i.configurable&&Object.defineProperty(r.DetermineComponentFrameRoot,"name",{value:`DetermineComponentFrameRoot`});var a=r.DetermineComponentFrameRoot(),o=a[0],s=a[1];if(o&&s){var c=o.split(`\n`),l=s.split(`\n`);for(i=r=0;r<c.length&&!c[r].includes(`DetermineComponentFrameRoot`);)r++;for(;i<l.length&&!l[i].includes(`DetermineComponentFrameRoot`);)i++;if(r===c.length||i===l.length)for(r=c.length-1,i=l.length-1;1<=r&&0<=i&&c[r]!==l[i];)i--;for(;1<=r&&0<=i;r--,i--)if(c[r]!==l[i]){if(r!==1||i!==1)do if(r--,i--,0>i||c[r]!==l[i]){var u=`\n`+c[r].replace(` at new `,` at `);return e.displayName&&u.includes(`<anonymous>`)&&(u=u.replace(`<anonymous>`,e.displayName)),u}while(1<=r&&0<=i);break}}}finally{Ae=!1,Error.prepareStackTrace=n}return(n=e?e.displayName||e.name:``)?ke(n):``}function Me(e,t){switch(e.tag){case 26:case 27:case 5:return ke(e.type);case 16:return ke(`Lazy`);case 13:return e.child!==t&&t!==null?ke(`Suspense Fallback`):ke(`Suspense`);case 19:return ke(`SuspenseList`);case 0:case 15:return je(e.type,!1);case 11:return je(e.type.render,!1);case 1:return je(e.type,!0);case 31:return ke(`Activity`);case 30:return ke(`ViewTransition`);default:return``}}function Ne(e){try{var t=``,n=null;do t+=Me(e,n),n=e,e=e.return;while(e);return t}catch(e){return`\nError generating stack: `+e.message+`\n`+e.stack}}var Pe=Object.prototype.hasOwnProperty,Fe=t.unstable_scheduleCallback,Ie=t.unstable_cancelCallback,Le=t.unstable_shouldYield,Re=t.unstable_requestPaint,ze=t.unstable_now,Be=t.unstable_getCurrentPriorityLevel,Ve=t.unstable_ImmediatePriority,He=t.unstable_UserBlockingPriority,Ue=t.unstable_NormalPriority,We=t.unstable_LowPriority,Ge=t.unstable_IdlePriority,Ke=t.log,qe=t.unstable_setDisableYieldValue,Je=null,Ye=null;function Xe(e){if(typeof Ke==`function`&&qe(e),Ye&&typeof Ye.setStrictMode==`function`)try{Ye.setStrictMode(Je,e)}catch{}}var Ze=Math.clz32?Math.clz32:et,Qe=Math.log,$e=Math.LN2;function et(e){return e>>>=0,e===0?32:31-(Qe(e)/$e|0)|0}var tt=256,nt=262144,rt=4194304;function it(e){var t=e&42;if(t!==0)return t;switch(e&-e){case 1:return 1;case 2:return 2;case 4:return 4;case 8:return 8;case 16:return 16;case 32:return 32;case 64:return 64;case 128:return 128;case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:return e&-e;case 262144:case 524288:case 1048576:case 2097152:return e&3932160;case 4194304:case 8388608:case 16777216:case 33554432:return e&62914560;case 67108864:return 67108864;case 134217728:return 134217728;case 268435456:return 268435456;case 536870912:return 536870912;case 1073741824:return 0;default:return e}}function at(e,t,n){var r=e.pendingLanes;if(r===0)return 0;var i=0,a=e.suspendedLanes,o=e.pingedLanes;e=e.warmLanes;var s=r&134217727;return s===0?(s=r&~a,s===0?o===0?n||(n=r&~e,n!==0&&(i=it(n))):i=it(o):i=it(s)):(r=s&~a,r===0?(o&=s,o===0?n||(n=s&~e,n!==0&&(i=it(n))):i=it(o)):i=it(r)),i===0?0:t!==0&&t!==i&&(t&a)===0&&(a=i&-i,n=t&-t,a>=n||a===32&&n&4194048)?t:i}function ot(e,t){return(e.pendingLanes&~(e.suspendedLanes&~e.pingedLanes)&t)===0}function st(e,t){t&8&&(t|=t&32);var n=e.entangledLanes;if(n!==0)for(e=e.entanglements,n&=t;0<n;){var r=31-Ze(n),i=1<<r;t|=e[r],n&=~i}return t}function ct(e,t){switch(e){case 1:case 2:case 4:case 8:case 64:return t+250;case 16:case 32:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return t+5e3;case 4194304:case 8388608:case 16777216:case 33554432:return-1;case 67108864:case 134217728:case 268435456:case 536870912:case 1073741824:return-1;default:return-1}}function lt(){var e=rt;return rt<<=1,!(rt&62914560)&&(rt=4194304),e}function ut(e){for(var t=[],n=0;31>n;n++)t.push(e);return t}function dt(e,t){e.pendingLanes|=t,t!==268435456&&(e.suspendedLanes=0,e.pingedLanes=0,e.warmLanes=0)}function ft(e,t,n,r,i,a){var o=e.pendingLanes;e.pendingLanes=n,e.suspendedLanes=0,e.pingedLanes=0,e.warmLanes=0,e.expiredLanes&=n,e.entangledLanes&=n,e.errorRecoveryDisabledLanes&=n,e.shellSuspendCounter=0;var s=e.entanglements,c=e.expirationTimes,l=e.hiddenUpdates;for(n=o&~n;0<n;){var u=31-Ze(n),d=1<<u;s[u]=0,c[u]=-1;var f=l[u];if(f!==null)for(l[u]=null,u=0;u<f.length;u++){var p=f[u];p!==null&&(p.lane&=-536870913)}n&=~d}r!==0&&pt(e,r,0),a!==0&&i===0&&e.tag!==0&&(e.suspendedLanes|=a&~(o&~t))}function pt(e,t,n){e.pendingLanes|=t,e.suspendedLanes&=~t;var r=31-Ze(t);e.entangledLanes|=t,e.entanglements[r]=e.entanglements[r]|1073741824|n&261930}function mt(e,t){var n=e.entangledLanes|=t;for(e=e.entanglements;n;){var r=31-Ze(n),i=1<<r;i&t|e[r]&t&&(e[r]|=t),n&=~i}}function ht(e,t){var n=t&-t;return n=n&42?1:gt(n),(n&(e.suspendedLanes|t))===0?n:0}function gt(e){switch(e){case 2:e=1;break;case 8:e=4;break;case 32:e=16;break;case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:case 4194304:case 8388608:case 16777216:case 33554432:e=128;break;case 268435456:e=134217728;break;default:e=0}return e}function _t(e){return e&=-e,2<e?8<e?e&134217727?32:268435456:8:2}function vt(){var e=I.p;return e===0?(e=window.event,e===void 0?32:Ch(e.type)):e}function yt(e,t){var n=I.p;try{return I.p=e,t()}finally{I.p=n}}var bt=Math.random().toString(36).slice(2),xt=`__reactFiber$`+bt,St=`__reactProps$`+bt,Ct=`__reactContainer$`+bt,wt=`__reactEvents$`+bt,Tt=`__reactListeners$`+bt,Et=`__reactHandles$`+bt,Dt=`__reactResources$`+bt,Ot=`__reactMarker$`+bt,kt=`__reactLoad$`+bt;function At(e){delete e[xt],delete e[St],delete e[Tt],delete e[Et]}function jt(e){var t;if(t=e[xt])return t;for(var n=e.parentNode;n;){if(t=n[Ct]||n[xt]){if(n=t.alternate,t.child!==null||n!==null&&n.child!==null)for(e=fm(e);e!==null;){if(n=e[xt])return n;e=fm(e)}return t}e=n,n=e.parentNode}return null}function Mt(e){if(e=e[xt]||e[Ct]){var t=e.tag;if(t===5||t===6||t===13||t===31||t===26||t===27||t===3)return e}return null}function Nt(e){var t=e.tag;if(t===5||t===26||t===27||t===6)return e.stateNode;throw Error(i(33))}function Pt(e){var t=e[Dt];return t||=e[Dt]={hoistableStyles:new Map,hoistableScripts:new Map},t}function Ft(e){e[Ot]=!0}function It(e){e[kt]=void 0}var Lt=new Set,Rt={};function zt(e,t){Bt(e,t),Bt(e+`Capture`,t)}function Bt(e,t){for(Rt[e]=t,e=0;e<t.length;e++)Lt.add(t[e])}var Vt=RegExp(`^[:A-Z_a-z\\\\u00C0-\\\\u00D6\\\\u00D8-\\\\u00F6\\\\u00F8-\\\\u02FF\\\\u0370-\\\\u037D\\\\u037F-\\\\u1FFF\\\\u200C-\\\\u200D\\\\u2070-\\\\u218F\\\\u2C00-\\\\u2FEF\\\\u3001-\\\\uD7FF\\\\uF900-\\\\uFDCF\\\\uFDF0-\\\\uFFFD][:A-Z_a-z\\\\u00C0-\\\\u00D6\\\\u00D8-\\\\u00F6\\\\u00F8-\\\\u02FF\\\\u0370-\\\\u037D\\\\u037F-\\\\u1FFF\\\\u200C-\\\\u200D\\\\u2070-\\\\u218F\\\\u2C00-\\\\u2FEF\\\\u3001-\\\\uD7FF\\\\uF900-\\\\uFDCF\\\\uFDF0-\\\\uFFFD\\\\-.0-9\\\\u00B7\\\\u0300-\\\\u036F\\\\u203F-\\\\u2040]*$`),Ht={},Ut={};function Wt(e){return Pe.call(Ut,e)?!0:Pe.call(Ht,e)?!1:Vt.test(e)?Ut[e]=!0:(Ht[e]=!0,!1)}var B=!1;function Gt(){var e=B;return B=!1,e}function Kt(e,t,n){if(Wt(t)){if(n===null)e.removeAttribute(t);else{switch(typeof n){case`undefined`:case`function`:case`symbol`:e.removeAttribute(t);return;case`boolean`:var r=t.toLowerCase().slice(0,5);if(r!==`data-`&&r!==`aria-`){e.removeAttribute(t);return}}e.setAttribute(t,n)}}}function qt(e,t,n){if(n===null)e.removeAttribute(t);else{switch(typeof n){case`undefined`:case`function`:case`symbol`:case`boolean`:e.removeAttribute(t);return}e.setAttribute(t,n)}}function Jt(e,t,n,r){if(r===null)e.removeAttribute(n);else{switch(typeof r){case`undefined`:case`function`:case`symbol`:case`boolean`:e.removeAttribute(n);return}e.setAttributeNS(t,n,r)}}function Yt(e){switch(typeof e){case`bigint`:case`boolean`:case`number`:case`string`:case`undefined`:return e;case`object`:return e;default:return``}}function Xt(e){var t=e.type;return(e=e.nodeName)&&e.toLowerCase()===`input`&&(t===`checkbox`||t===`radio`)}function Zt(e,t,n){var r=Object.getOwnPropertyDescriptor(e.constructor.prototype,t);if(!e.hasOwnProperty(t)&&r!==void 0&&typeof r.get==`function`&&typeof r.set==`function`){var i=r.get,a=r.set;return Object.defineProperty(e,t,{configurable:!0,get:function(){return i.call(this)},set:function(e){n=``+e,a.call(this,e)}}),Object.defineProperty(e,t,{enumerable:r.enumerable}),{getValue:function(){return n},setValue:function(e){n=``+e},stopTracking:function(){e._valueTracker=null,delete e[t]}}}}function Qt(e){if(!e._valueTracker){var t=Xt(e)?`checked`:`value`;e._valueTracker=Zt(e,t,``+e[t])}}function $t(e){if(!e)return!1;var t=e._valueTracker;if(!t)return!0;var n=t.getValue(),r=``;return e&&(r=Xt(e)?e.checked?`true`:`false`:e.value),e=r,e!==n&&(t.setValue(e),!0)}var en=/[\\n"\\\\]/g;function tn(e){return e.replace(en,function(e){return`\\\\`+e.charCodeAt(0).toString(16)+` `})}function nn(e,t,n,r,i,a,o,s){e.name=``,o!=null&&typeof o!=`function`&&typeof o!=`symbol`&&typeof o!=`boolean`?e.type=o:e.removeAttribute(`type`),t==null?o!==`submit`&&o!==`reset`||e.removeAttribute(`value`):o===`number`?(t===0&&e.value===``||e.value!=t)&&(e.value=``+Yt(t)):e.value!==``+Yt(t)&&(e.value=``+Yt(t)),t==null?n==null?r!=null&&e.removeAttribute(`value`):an(e,Yt(n)):o===`number`&&e.value==t?an(e,Yt(e.value)):an(e,Yt(t)),i==null&&a!=null&&(e.defaultChecked=!!a),i!=null&&(e.checked=i&&typeof i!=`function`&&typeof i!=`symbol`),s!=null&&typeof s!=`function`&&typeof s!=`symbol`&&typeof s!=`boolean`?e.name=``+Yt(s):e.removeAttribute(`name`)}function rn(e,t,n,r,i,a,o,s){if(a!=null&&typeof a!=`function`&&typeof a!=`symbol`&&typeof a!=`boolean`&&(e.type=a),t!=null||n!=null){if(!(a!==`submit`&&a!==`reset`||t!=null)){Qt(e);return}n=n==null?``:``+Yt(n),t=t==null?n:``+Yt(t),s||t===e.value||(e.value=t),e.defaultValue=t}r??=i,r=typeof r!=`function`&&typeof r!=`symbol`&&!!r,e.checked=s?e.checked:!!r,e.defaultChecked=!!r,o!=null&&typeof o!=`function`&&typeof o!=`symbol`&&typeof o!=`boolean`&&(e.name=o),Qt(e)}function an(e,t){e.defaultValue!==``+t&&(e.defaultValue=``+t)}function on(e,t,n,r){if(e=e.options,t){t={};for(var i=0;i<n.length;i++)t[`$`+n[i]]=!0;for(n=0;n<e.length;n++)i=t.hasOwnProperty(`$`+e[n].value),e[n].selected!==i&&(e[n].selected=i),i&&r&&(e[n].defaultSelected=!0)}else{for(n=``+Yt(n),t=null,i=0;i<e.length;i++){if(e[i].value===n){e[i].selected=!0,r&&(e[i].defaultSelected=!0);return}t!==null||e[i].disabled||(t=e[i])}t!==null&&(t.selected=!0)}}function sn(e,t,n){t!=null&&(t=``+Yt(t),t!==e.value&&(e.value=t),n==null)?e.defaultValue!==t&&(e.defaultValue=t):e.defaultValue=n==null?``:``+Yt(n)}function cn(e,t,n,r){if(t==null){if(r!=null){if(n!=null)throw Error(i(92));if(he(r)){if(1<r.length)throw Error(i(93));r=r[0]}n=r}n??=``,t=n}n=Yt(t),e.defaultValue=n,r=e.textContent,r===n&&r!==``&&r!==null&&(e.value=r),Qt(e)}function ln(e,t){if(t){var n=e.firstChild;if(n&&n===e.lastChild&&n.nodeType===3){n.nodeValue=t;return}}e.textContent=t}var un=new Set(`animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp`.split(` `));function dn(e,t,n){var r=t.indexOf(`--`)===0;n==null||typeof n==`boolean`||n===``?r?e.setProperty(t,``):t===`float`?e.cssFloat=``:e[t]=``:r?e.setProperty(t,n):typeof n!=`number`||n===0||un.has(t)?t===`float`?e.cssFloat=n:e[t]=(``+n).trim():e[t]=n+`px`}function fn(e,t,n){if(t!=null&&typeof t!=`object`)throw Error(i(62));if(e=e.style,n!=null){for(var r in n)!n.hasOwnProperty(r)||t!=null&&t.hasOwnProperty(r)||(r.indexOf(`--`)===0?e.setProperty(r,``):r===`float`?e.cssFloat=``:e[r]=``,B=!0);for(var a in t)r=t[a],t.hasOwnProperty(a)&&n[a]!==r&&(dn(e,a,r),B=!0)}else for(var o in t)t.hasOwnProperty(o)&&dn(e,o,t[o])}function pn(e){if(e.indexOf(`-`)===-1)return!1;switch(e){case`annotation-xml`:case`color-profile`:case`font-face`:case`font-face-src`:case`font-face-uri`:case`font-face-format`:case`font-face-name`:case`missing-glyph`:return!1;default:return!0}}var mn=new Map([[`acceptCharset`,`accept-charset`],[`htmlFor`,`for`],[`httpEquiv`,`http-equiv`],[`crossOrigin`,`crossorigin`],[`accentHeight`,`accent-height`],[`alignmentBaseline`,`alignment-baseline`],[`arabicForm`,`arabic-form`],[`baselineShift`,`baseline-shift`],[`capHeight`,`cap-height`],[`clipPath`,`clip-path`],[`clipRule`,`clip-rule`],[`colorInterpolation`,`color-interpolation`],[`colorInterpolationFilters`,`color-interpolation-filters`],[`colorProfile`,`color-profile`],[`colorRendering`,`color-rendering`],[`dominantBaseline`,`dominant-baseline`],[`enableBackground`,`enable-background`],[`fillOpacity`,`fill-opacity`],[`fillRule`,`fill-rule`],[`floodColor`,`flood-color`],[`floodOpacity`,`flood-opacity`],[`fontFamily`,`font-family`],[`fontSize`,`font-size`],[`fontSizeAdjust`,`font-size-adjust`],[`fontStretch`,`font-stretch`],[`fontStyle`,`font-style`],[`fontVariant`,`font-variant`],[`fontWeight`,`font-weight`],[`glyphName`,`glyph-name`],[`glyphOrientationHorizontal`,`glyph-orientation-horizontal`],[`glyphOrientationVertical`,`glyph-orientation-vertical`],[`horizAdvX`,`horiz-adv-x`],[`horizOriginX`,`horiz-origin-x`],[`imageRendering`,`image-rendering`],[`letterSpacing`,`letter-spacing`],[`lightingColor`,`lighting-color`],[`markerEnd`,`marker-end`],[`markerMid`,`marker-mid`],[`markerStart`,`marker-start`],[`maskType`,`mask-type`],[`overlinePosition`,`overline-position`],[`overlineThickness`,`overline-thickness`],[`paintOrder`,`paint-order`],[`panose-1`,`panose-1`],[`pointerEvents`,`pointer-events`],[`renderingIntent`,`rendering-intent`],[`shapeRendering`,`shape-rendering`],[`stopColor`,`stop-color`],[`stopOpacity`,`stop-opacity`],[`strikethroughPosition`,`strikethrough-position`],[`strikethroughThickness`,`strikethrough-thickness`],[`strokeDasharray`,`stroke-dasharray`],[`strokeDashoffset`,`stroke-dashoffset`],[`strokeLinecap`,`stroke-linecap`],[`strokeLinejoin`,`stroke-linejoin`],[`strokeMiterlimit`,`stroke-miterlimit`],[`strokeOpacity`,`stroke-opacity`],[`strokeWidth`,`stroke-width`],[`textAnchor`,`text-anchor`],[`textDecoration`,`text-decoration`],[`textRendering`,`text-rendering`],[`transformOrigin`,`transform-origin`],[`underlinePosition`,`underline-position`],[`underlineThickness`,`underline-thickness`],[`unicodeBidi`,`unicode-bidi`],[`unicodeRange`,`unicode-range`],[`unitsPerEm`,`units-per-em`],[`vAlphabetic`,`v-alphabetic`],[`vHanging`,`v-hanging`],[`vIdeographic`,`v-ideographic`],[`vMathematical`,`v-mathematical`],[`vectorEffect`,`vector-effect`],[`vertAdvY`,`vert-adv-y`],[`vertOriginX`,`vert-origin-x`],[`vertOriginY`,`vert-origin-y`],[`wordSpacing`,`word-spacing`],[`writingMode`,`writing-mode`],[`xmlnsXlink`,`xmlns:xlink`],[`xHeight`,`x-height`]]),hn=/^[\\u0000-\\u001F ]*j[\\r\\n\\t]*a[\\r\\n\\t]*v[\\r\\n\\t]*a[\\r\\n\\t]*s[\\r\\n\\t]*c[\\r\\n\\t]*r[\\r\\n\\t]*i[\\r\\n\\t]*p[\\r\\n\\t]*t[\\r\\n\\t]*:/i;function gn(e){return hn.test(``+e)?`javascript:throw new Error(\'React has blocked a javascript: URL as a security precaution.\')`:e}function _n(){}var vn=null;function yn(e){return e=e.target||e.srcElement||window,e.correspondingUseElement&&(e=e.correspondingUseElement),e.nodeType===3?e.parentNode:e}var bn=null,xn=null;function Sn(e){var t=Mt(e);if(t&&(e=t.stateNode)){var n=e[St]||null;a:switch(e=t.stateNode,t.type){case`input`:if(nn(e,n.value,n.defaultValue,n.defaultValue,n.checked,n.defaultChecked,n.type,n.name),t=n.name,n.type===`radio`&&t!=null){for(n=e;n.parentNode;)n=n.parentNode;for(n=n.querySelectorAll(`input[name="`+tn(``+t)+`"][type="radio"]`),t=0;t<n.length;t++){var r=n[t];if(r!==e&&r.form===e.form){var a=r[St]||null;if(!a)throw Error(i(90));nn(r,a.value,a.defaultValue,a.defaultValue,a.checked,a.defaultChecked,a.type,a.name)}}for(t=0;t<n.length;t++)r=n[t],r.form===e.form&&$t(r)}break a;case`textarea`:sn(e,n.value,n.defaultValue);break a;case`select`:t=n.value,t!=null&&on(e,!!n.multiple,t,!1)}}}var Cn=!1;function wn(e,t,n){if(Cn)return e(t,n);Cn=!0;try{return e(t)}finally{if(Cn=!1,(bn!==null||xn!==null)&&(Rd(),bn&&(t=bn,e=xn,xn=bn=null,Sn(t),e)))for(t=0;t<e.length;t++)Sn(e[t])}}function Tn(e,t){var n=e.stateNode;if(n===null)return null;var r=n[St]||null;if(r===null)return null;n=r[t];a:switch(t){case`onClick`:case`onClickCapture`:case`onDoubleClick`:case`onDoubleClickCapture`:case`onMouseDown`:case`onMouseDownCapture`:case`onMouseMove`:case`onMouseMoveCapture`:case`onMouseUp`:case`onMouseUpCapture`:case`onMouseEnter`:(r=!r.disabled)||(e=e.type,r=e!==`button`&&e!==`input`&&e!==`select`&&e!==`textarea`),e=!r;break a;default:e=!1}if(e)return null;if(n&&typeof n!=`function`)throw Error(i(231,t,typeof n));return n}var En=typeof window<`u`&&window.document!==void 0&&window.document.createElement!==void 0,Dn=!1;if(En)try{var On={};Object.defineProperty(On,"passive",{get:function(){Dn=!0}}),window.addEventListener(`test`,On,On),window.removeEventListener(`test`,On,On)}catch{Dn=!1}var kn=null,An=null,jn=null;function Mn(){if(jn)return jn;var e,t=An,n=t.length,r,i=`value`in kn?kn.value:kn.textContent,a=i.length;for(e=0;e<n&&t[e]===i[e];e++);var o=n-e;for(r=1;r<=o&&t[n-r]===i[a-r];r++);return jn=i.slice(e,1<r?1-r:void 0)}function Nn(e){var t=e.keyCode;return`charCode`in e?(e=e.charCode,e===0&&t===13&&(e=13)):e=t,e===10&&(e=13),32<=e||e===13?e:0}function Pn(){return!0}function Fn(){return!1}function In(e){function t(t,n,r,i,a){for(var o in this._reactName=t,this._targetInst=r,this.type=n,this.nativeEvent=i,this.target=a,this.currentTarget=null,e)e.hasOwnProperty(o)&&(t=e[o],this[o]=t?t(i):i[o]);return this.isDefaultPrevented=(i.defaultPrevented==null?!1===i.returnValue:i.defaultPrevented)?Pn:Fn,this.isPropagationStopped=Fn,this}return D(t.prototype,{preventDefault:function(){this.defaultPrevented=!0;var e=this.nativeEvent;e&&(e.preventDefault?e.preventDefault():typeof e.returnValue!=`unknown`&&(e.returnValue=!1),this.isDefaultPrevented=Pn)},stopPropagation:function(){var e=this.nativeEvent;e&&(e.stopPropagation?e.stopPropagation():typeof e.cancelBubble!=`unknown`&&(e.cancelBubble=!0),this.isPropagationStopped=Pn)},persist:function(){},isPersistent:Pn}),t}var Ln={eventPhase:0,bubbles:0,cancelable:0,timeStamp:function(e){return e.timeStamp||Date.now()},defaultPrevented:0,isTrusted:0},Rn=In(Ln),zn=D({},Ln,{view:0,detail:0}),Bn=In(zn),Vn,Hn,Un,Wn=D({},zn,{screenX:0,screenY:0,clientX:0,clientY:0,pageX:0,pageY:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,getModifierState:tr,button:0,buttons:0,relatedTarget:function(e){return e.relatedTarget===void 0?e.fromElement===e.srcElement?e.toElement:e.fromElement:e.relatedTarget},movementX:function(e){return`movementX`in e?e.movementX:(e!==Un&&(Un&&e.type===`mousemove`?(Vn=e.screenX-Un.screenX,Hn=e.screenY-Un.screenY):Hn=Vn=0,Un=e),Vn)},movementY:function(e){return`movementY`in e?e.movementY:Hn}}),Gn=In(Wn),Kn=In(D({},Wn,{dataTransfer:0})),qn=In(D({},zn,{relatedTarget:0})),Jn=In(D({},Ln,{animationName:0,elapsedTime:0,pseudoElement:0})),Yn=In(D({},Ln,{clipboardData:function(e){return`clipboardData`in e?e.clipboardData:window.clipboardData}})),Xn=In(D({},Ln,{data:0})),Zn={Esc:`Escape`,Spacebar:` `,Left:`ArrowLeft`,Up:`ArrowUp`,Right:`ArrowRight`,Down:`ArrowDown`,Del:`Delete`,Win:`OS`,Menu:`ContextMenu`,Apps:`ContextMenu`,Scroll:`ScrollLock`,MozPrintableKey:`Unidentified`},Qn={8:`Backspace`,9:`Tab`,12:`Clear`,13:`Enter`,16:`Shift`,17:`Control`,18:`Alt`,19:`Pause`,20:`CapsLock`,27:`Escape`,32:` `,33:`PageUp`,34:`PageDown`,35:`End`,36:`Home`,37:`ArrowLeft`,38:`ArrowUp`,39:`ArrowRight`,40:`ArrowDown`,45:`Insert`,46:`Delete`,112:`F1`,113:`F2`,114:`F3`,115:`F4`,116:`F5`,117:`F6`,118:`F7`,119:`F8`,120:`F9`,121:`F10`,122:`F11`,123:`F12`,144:`NumLock`,145:`ScrollLock`,224:`Meta`},$n={Alt:`altKey`,Control:`ctrlKey`,Meta:`metaKey`,Shift:`shiftKey`};function er(e){var t=this.nativeEvent;return t.getModifierState?t.getModifierState(e):(e=$n[e])?!!t[e]:!1}function tr(){return er}var nr=In(D({},zn,{key:function(e){if(e.key){var t=Zn[e.key]||e.key;if(t!==`Unidentified`)return t}return e.type===`keypress`?(e=Nn(e),e===13?`Enter`:String.fromCharCode(e)):e.type===`keydown`||e.type===`keyup`?Qn[e.keyCode]||`Unidentified`:``},code:0,location:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,repeat:0,locale:0,getModifierState:tr,charCode:function(e){return e.type===`keypress`?Nn(e):0},keyCode:function(e){return e.type===`keydown`||e.type===`keyup`?e.keyCode:0},which:function(e){return e.type===`keypress`?Nn(e):e.type===`keydown`||e.type===`keyup`?e.keyCode:0}})),rr=In(D({},Wn,{pointerId:0,width:0,height:0,pressure:0,tangentialPressure:0,tiltX:0,tiltY:0,twist:0,pointerType:0,isPrimary:0})),ir=In(D({},Ln,{submitter:0})),ar=In(D({},zn,{touches:0,targetTouches:0,changedTouches:0,altKey:0,metaKey:0,ctrlKey:0,shiftKey:0,getModifierState:tr})),or=In(D({},Ln,{propertyName:0,elapsedTime:0,pseudoElement:0})),sr=In(D({},Wn,{deltaX:function(e){return`deltaX`in e?e.deltaX:`wheelDeltaX`in e?-e.wheelDeltaX:0},deltaY:function(e){return`deltaY`in e?e.deltaY:`wheelDeltaY`in e?-e.wheelDeltaY:`wheelDelta`in e?-e.wheelDelta:0},deltaZ:0,deltaMode:0})),cr=In(D({},Ln,{newState:0,oldState:0,source:0})),lr=[9,13,27,32],ur=En&&`CompositionEvent`in window,dr=null;En&&`documentMode`in document&&(dr=document.documentMode);var fr=En&&`TextEvent`in window&&!dr,pr=En&&(!ur||dr&&8<dr&&11>=dr),mr=` `,hr=!1;function gr(e,t){switch(e){case`keyup`:return lr.indexOf(t.keyCode)!==-1;case`keydown`:return t.keyCode!==229;case`keypress`:case`mousedown`:case`focusout`:return!0;default:return!1}}function _r(e){return e=e.detail,typeof e==`object`&&`data`in e?e.data:null}var vr=!1;function yr(e,t){switch(e){case`compositionend`:return _r(t);case`keypress`:return t.which===32?(hr=!0,mr):null;case`textInput`:return e=t.data,e===mr&&hr?null:e;default:return null}}function br(e,t){if(vr)return e===`compositionend`||!ur&&gr(e,t)?(e=Mn(),jn=An=kn=null,vr=!1,e):null;switch(e){case`paste`:return null;case`keypress`:if(!(t.ctrlKey||t.altKey||t.metaKey)||t.ctrlKey&&t.altKey){if(t.char&&1<t.char.length)return t.char;if(t.which)return String.fromCharCode(t.which)}return null;case`compositionend`:return pr&&t.locale!==`ko`?null:t.data;default:return null}}var xr={color:!0,date:!0,datetime:!0,"datetime-local":!0,email:!0,month:!0,number:!0,password:!0,range:!0,search:!0,tel:!0,text:!0,time:!0,url:!0,week:!0};function Sr(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t===`input`?!!xr[e.type]:t===`textarea`}function Cr(e,t,n,r){bn?xn?xn.push(r):xn=[r]:bn=r,t=Jf(t,`onChange`),0<t.length&&(n=new Rn(`onChange`,`change`,null,n,r),e.push({event:n,listeners:t}))}var wr=null,Tr=null;function Er(e){Vf(e,0)}function Dr(e){if($t(Nt(e)))return e}function Or(e,t){if(e===`change`)return t}var kr=!1;if(En){var Ar;if(En){var jr=`oninput`in document;if(!jr){var Mr=document.createElement(`div`);Mr.setAttribute(`oninput`,`return;`),jr=typeof Mr.oninput==`function`}Ar=jr}else Ar=!1;kr=Ar&&(!document.documentMode||9<document.documentMode)}function Nr(){wr&&(wr.detachEvent(`onpropertychange`,Pr),Tr=wr=null)}function Pr(e){if(e.propertyName===`value`&&Dr(Tr)){var t=[];Cr(t,Tr,e,yn(e)),wn(Er,t)}}function Fr(e,t,n){e===`focusin`?(Nr(),wr=t,Tr=n,wr.attachEvent(`onpropertychange`,Pr)):e===`focusout`&&Nr()}function Ir(e){if(e===`selectionchange`||e===`keyup`||e===`keydown`)return Dr(Tr)}function Lr(e,t){if(e===`click`)return Dr(t)}function Rr(e,t){if(e===`input`||e===`change`)return Dr(t)}function zr(e,t){return e===t&&(e!==0||1/e==1/t)||e!==e&&t!==t}var Br=typeof Object.is==`function`?Object.is:zr;function Vr(e,t){if(Br(e,t))return!0;if(typeof e!=`object`||!e||typeof t!=`object`||!t)return!1;var n=Object.keys(e),r=Object.keys(t);if(n.length!==r.length)return!1;for(r=0;r<n.length;r++){var i=n[r];if(!Pe.call(t,i)||!Br(e[i],t[i]))return!1}return!0}function Hr(e){if(e||=typeof document<`u`?document:void 0,e===void 0)return null;try{return e.activeElement||e.body}catch{return e.body}}function Ur(e){for(;e&&e.firstChild;)e=e.firstChild;return e}function Wr(e,t){var n=Ur(e);e=0;for(var r;n;){if(n.nodeType===3){if(r=e+n.textContent.length,e<=t&&r>=t)return{node:n,offset:t-e};e=r}a:{for(;n;){if(n.nextSibling){n=n.nextSibling;break a}n=n.parentNode}n=void 0}n=Ur(n)}}function Gr(e,t){return e&&t?e===t?!0:e&&e.nodeType===3?!1:t&&t.nodeType===3?Gr(e,t.parentNode):`contains`in e?e.contains(t):e.compareDocumentPosition?!!(e.compareDocumentPosition(t)&16):!1:!1}function Kr(e){e=e!=null&&e.ownerDocument!=null&&e.ownerDocument.defaultView!=null?e.ownerDocument.defaultView:window;for(var t=Hr(e.document);t instanceof e.HTMLIFrameElement;){try{var n=typeof t.contentWindow.location.href==`string`}catch{n=!1}if(n)e=t.contentWindow;else break;t=Hr(e.document)}return t}function qr(e){var t=e&&e.nodeName&&e.nodeName.toLowerCase();return t&&(t===`input`&&(e.type===`text`||e.type===`search`||e.type===`tel`||e.type===`url`||e.type===`password`)||t===`textarea`||e.contentEditable===`true`)}var Jr=En&&`documentMode`in document&&11>=document.documentMode,Yr=null,Xr=null,Zr=null,Qr=!1;function $r(e,t,n){var r=n.window===n?n.document:n.nodeType===9?n:n.ownerDocument;Qr||Yr==null||Yr!==Hr(r)||(r=Yr,`selectionStart`in r&&qr(r)?r={start:r.selectionStart,end:r.selectionEnd}:(r=(r.ownerDocument&&r.ownerDocument.defaultView||window).getSelection(),r={anchorNode:r.anchorNode,anchorOffset:r.anchorOffset,focusNode:r.focusNode,focusOffset:r.focusOffset}),Zr&&Vr(Zr,r)||(Zr=r,r=Jf(Xr,`onSelect`),0<r.length&&(t=new Rn(`onSelect`,`select`,null,t,n),e.push({event:t,listeners:r}),t.target=Yr)))}function ei(e,t){var n={};return n[e.toLowerCase()]=t.toLowerCase(),n[`Webkit`+e]=`webkit`+t,n[`Moz`+e]=`moz`+t,n}var ti={animationend:ei(`Animation`,`AnimationEnd`),animationiteration:ei(`Animation`,`AnimationIteration`),animationstart:ei(`Animation`,`AnimationStart`),transitionrun:ei(`Transition`,`TransitionRun`),transitionstart:ei(`Transition`,`TransitionStart`),transitioncancel:ei(`Transition`,`TransitionCancel`),transitionend:ei(`Transition`,`TransitionEnd`)},ni={},ri={};En&&(ri=document.createElement(`div`).style,`AnimationEvent`in window||(delete ti.animationend.animation,delete ti.animationiteration.animation,delete ti.animationstart.animation),`TransitionEvent`in window||delete ti.transitionend.transition);function ii(e){if(ni[e])return ni[e];if(!ti[e])return e;var t=ti[e],n;for(n in t)if(t.hasOwnProperty(n)&&n in ri)return ni[e]=t[n];return e}var ai=ii(`animationend`),oi=ii(`animationiteration`),si=ii(`animationstart`),ci=ii(`transitionrun`),li=ii(`transitionstart`),ui=ii(`transitioncancel`),di=ii(`transitionend`),fi=new Map,pi=`abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error fullscreenChange fullscreenError gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel`.split(` `);pi.push(`scrollEnd`);function mi(e,t){fi.set(e,t),zt(t,[e])}var hi=0;function gi(e,t){if(e.name!=null&&e.name!==`auto`)return e.name;if(t.autoName!==null)return t.autoName;e=yd.identifierPrefix;var n=hi++;return e=`_`+e+`t_`+n.toString(32)+`_`,t.autoName=e}function _i(e){if(e==null||typeof e==`string`)return e;var t=null,n=Dd;if(n!==null)for(var r=0;r<n.length;r++){var i=e[n[r]];if(i!=null){if(i===`none`)return`none`;t=t==null?i:t+(` `+i)}}return t??e.default}function vi(e,t){return e=_i(e),t=_i(t),t==null?e===`auto`?null:e:t===`auto`?null:t}var yi=typeof reportError==`function`?reportError:function(e){if(typeof window==`object`&&typeof window.ErrorEvent==`function`){var t=new window.ErrorEvent(`error`,{bubbles:!0,cancelable:!0,message:typeof e==`object`&&e&&typeof e.message==`string`?String(e.message):String(e),error:e});if(!window.dispatchEvent(t))return}else if(typeof process==`object`&&typeof process.emit==`function`){process.emit(`uncaughtException`,e);return}console.error(e)},bi=[],xi=0,Si=0;function Ci(){for(var e=xi,t=Si=xi=0;t<e;){var n=bi[t];bi[t++]=null;var r=bi[t];bi[t++]=null;var i=bi[t];bi[t++]=null;var a=bi[t];if(bi[t++]=null,r!==null&&i!==null){var o=r.pending;o===null?i.next=i:(i.next=o.next,o.next=i),r.pending=i}a!==0&&Di(n,i,a)}}function wi(e,t,n,r){bi[xi++]=e,bi[xi++]=t,bi[xi++]=n,bi[xi++]=r,Si|=r,e.lanes|=r,e=e.alternate,e!==null&&(e.lanes|=r)}function Ti(e,t,n,r){return wi(e,t,n,r),Oi(e)}function Ei(e,t){return wi(e,null,null,t),Oi(e)}function Di(e,t,n){e.lanes|=n;var r=e.alternate;r!==null&&(r.lanes|=n);for(var i=!1,a=e.return;a!==null;)a.childLanes|=n,r=a.alternate,r!==null&&(r.childLanes|=n),a.tag===22&&(e=a.stateNode,e===null||e._visibility&1||(i=!0)),e=a,a=a.return;return e.tag===3?(a=e.stateNode,i&&t!==null&&(i=31-Ze(n),e=a.hiddenUpdates,r=e[i],r===null?e[i]=[t]:r.push(t),t.lane=n|536870912),a):null}function Oi(e){if(50<Od)throw Od=0,kd=null,Error(i(185));for(var t=e.return;t!==null;)e=t,t=e.return;return e.tag===3?e.stateNode:null}var ki={};function Ai(e,t,n,r){this.tag=e,this.key=n,this.sibling=this.child=this.return=this.stateNode=this.type=this.elementType=null,this.index=0,this.refCleanup=this.ref=null,this.pendingProps=t,this.dependencies=this.memoizedState=this.updateQueue=this.memoizedProps=null,this.mode=r,this.subtreeFlags=this.flags=0,this.deletions=null,this.childLanes=this.lanes=0,this.alternate=null}function ji(e,t,n,r){return new Ai(e,t,n,r)}function Mi(e){return e=e.prototype,!(!e||!e.isReactComponent)}function Ni(e,t){var n=e.alternate;return n===null?(n=ji(e.tag,t,e.key,e.mode),n.elementType=e.elementType,n.type=e.type,n.stateNode=e.stateNode,n.alternate=e,e.alternate=n):(n.pendingProps=t,n.type=e.type,n.flags=0,n.subtreeFlags=0,n.deletions=null),n.flags=e.flags&1206910976,n.childLanes=e.childLanes,n.lanes=e.lanes,n.child=e.child,n.memoizedProps=e.memoizedProps,n.memoizedState=e.memoizedState,n.updateQueue=e.updateQueue,t=e.dependencies,n.dependencies=t===null?null:{lanes:t.lanes,firstContext:t.firstContext},n.sibling=e.sibling,n.index=e.index,n.ref=e.ref,n.refCleanup=e.refCleanup,n}function Pi(e,t){e.flags&=1206910978;var n=e.alternate;return n===null?(e.childLanes=0,e.lanes=t,e.child=null,e.subtreeFlags=0,e.memoizedProps=null,e.memoizedState=null,e.updateQueue=null,e.dependencies=null,e.stateNode=null):(e.childLanes=n.childLanes,e.lanes=n.lanes,e.child=n.child,e.subtreeFlags=0,e.deletions=null,e.memoizedProps=n.memoizedProps,e.memoizedState=n.memoizedState,e.updateQueue=n.updateQueue,e.type=n.type,t=n.dependencies,e.dependencies=t===null?null:{lanes:t.lanes,firstContext:t.firstContext}),e}function Fi(e,t,n,r,a,o){var s=0;if(r=e,typeof r==`function`)Mi(r)&&(s=1);else if(typeof r==`string`)s=qm(e,n,be.current)?26:e===`html`||e===`head`||e===`body`?27:5;else a:switch(r){case oe:return e=ji(31,n,t,a),e.elementType=oe,e.lanes=o,e;case j:return Ii(n.children,a,o,t);case ee:s=8,a|=24;break;case te:return e=ji(12,n,t,a|2),e.elementType=te,e.lanes=o,e;case re:return e=ji(13,n,t,a),e.elementType=re,e.lanes=o,e;case ie:return e=ji(19,n,t,a),e.elementType=ie,e.lanes=o,e;case se:case le:return e=a|32,e=ji(30,n,t,e),e.elementType=le,e.lanes=o,e.stateNode={autoName:null,paired:null,clones:null,ref:null},e;default:if(typeof r==`object`&&r)switch(r.$$typeof){case N:s=10;break a;case M:s=9;break a;case ne:s=11;break a;case P:s=14;break a;case ae:s=16,r=null;break a}s=29,n=Error(i(130,e===null?`null`:typeof e,``)),r=null}return t=ji(s,n,t,a),t.elementType=e,t.type=r,t.lanes=o,t}function Ii(e,t,n,r){return e=ji(7,e,r,t),e.lanes=n,e}function Li(e,t,n){return e=ji(6,e,null,t),e.lanes=n,e}function Ri(e){var t=ji(18,null,null,0);return t.stateNode=e,t}function zi(e,t,n){return t=ji(4,e.children===null?[]:e.children,e.key,t),t.lanes=n,t.stateNode={containerInfo:e.containerInfo,pendingChildren:null,implementation:e.implementation},t}var Bi=new WeakMap;function Vi(e,t){if(typeof e==`object`&&e){var n=Bi.get(e);return n===void 0?(t={value:e,source:t,stack:Ne(t)},Bi.set(e,t),t):n}return{value:e,source:t,stack:Ne(t)}}var Hi=[],Ui=0,Wi=null,Gi=0,Ki=[],qi=0,Ji=null,Yi=1,Xi=``;function Zi(e,t){Hi[Ui++]=Gi,Hi[Ui++]=Wi,Wi=e,Gi=t}function Qi(e,t,n){Ki[qi++]=Yi,Ki[qi++]=Xi,Ki[qi++]=Ji,Ji=e;var r=Yi;e=Xi;var i=32-Ze(r)-1;r&=~(1<<i),n+=1;var a=32-Ze(t)+i;if(30<a){var o=i-i%5;a=(r&(1<<o)-1).toString(32),r>>=o,i-=o,Yi=1<<32-Ze(t)+i|n<<i|r,Xi=a+e}else Yi=1<<a|n<<i|r,Xi=e}function $i(e){e.return!==null&&(Zi(e,1),Qi(e,1,0))}function ea(e){for(;e===Wi;)Wi=Hi[--Ui],Hi[Ui]=null,Gi=Hi[--Ui],Hi[Ui]=null;for(;e===Ji;)Ji=Ki[--qi],Ki[qi]=null,Xi=Ki[--qi],Ki[qi]=null,Yi=Ki[--qi],Ki[qi]=null}function ta(e,t){Ki[qi++]=Yi,Ki[qi++]=Xi,Ki[qi++]=Ji,Yi=t.id,Xi=t.overflow,Ji=e}var na=null,ra=null,V=!1,ia=null,aa=!1,oa=Error(i(519));function sa(e){throw pa(Vi(Error(i(418,1<arguments.length&&arguments[1]!==void 0&&arguments[1]?`text`:`HTML`,``)),e)),oa}function ca(e){var t=e.stateNode,n=e.type,r=e.memoizedProps;switch(t[xt]=e,t[St]=r,n){case`dialog`:Q(`cancel`,t),Q(`close`,t);break;case`iframe`:case`object`:case`embed`:Q(`load`,t);break;case`video`:case`audio`:for(n=0;n<zf.length;n++)Q(zf[n],t);break;case`source`:Q(`error`,t);break;case`img`:case`image`:case`link`:Q(`error`,t),Q(`load`,t);break;case`details`:Q(`toggle`,t);break;case`input`:Q(`invalid`,t),rn(t,r.value,r.defaultValue,r.checked,r.defaultChecked,r.type,r.name,!0);break;case`select`:Q(`invalid`,t);break;case`textarea`:Q(`invalid`,t),cn(t,r.value,r.defaultValue,r.children)}n=r.children,typeof n!=`string`&&typeof n!=`number`&&typeof n!=`bigint`||t.textContent===``+n||!0===r.suppressHydrationWarning||ep(t.textContent,n)?(r.popover!=null&&(Q(`beforetoggle`,t),Q(`toggle`,t)),r.onScroll!=null&&Q(`scroll`,t),r.onScrollEnd!=null&&Q(`scrollend`,t),r.onClick!=null&&(t.onclick=_n),t=!0):t=!1,t||sa(e,!0)}function la(e){for(na=e.return;na;)switch(na.tag){case 5:case 31:case 13:aa=!1;return;case 27:case 3:aa=!0;return;default:na=na.return}}function ua(e){if(e!==na)return!1;if(!V)return la(e),V=!0,!1;var t=e.tag,n;if((n=t!==3&&t!==27)&&((n=t===5)&&(n=e.type,n=n===`form`||n===`button`||pp(e.type,e.memoizedProps)),n=!n),n&&ra&&sa(e),la(e),t===13){if(e=e.memoizedState,e=e===null?null:e.dehydrated,!e)throw Error(i(317));ra=dm(e)}else if(t===31){if(e=e.memoizedState,e=e===null?null:e.dehydrated,!e)throw Error(i(317));ra=dm(e)}else t===27?(t=ra,Sp(e.type)?(e=um,um=null,ra=e):ra=t):ra=na?lm(e.stateNode.nextSibling):null;return!0}function da(){ra=na=null,V=!1}function fa(){var e=ia;return e!==null&&(dd===null?dd=e:dd.push.apply(dd,e),ia=null),e}function pa(e){ia===null?ia=[e]:ia.push(e)}var ma=ye(null),ha=null,ga=null;function _a(e,t,n){R(ma,t._currentValue),t._currentValue=n}function va(e){e._currentValue=ma.current,L(ma)}function ya(e,t,n){for(;e!==null;){var r=e.alternate;if((e.childLanes&t)===t?r!==null&&(r.childLanes&t)!==t&&(r.childLanes|=t):(e.childLanes|=t,r!==null&&(r.childLanes|=t)),e===n)break;e=e.return}}function ba(e,t,n,r){var a=e.child;for(a!==null&&(a.return=e);a!==null;){var o=a.dependencies;if(o!==null){var s=a.child;o=o.firstContext;a:for(;o!==null;){var c=o;o=a;for(var l=0;l<t.length;l++)if(c.context===t[l]){o.lanes|=n,c=o.alternate,c!==null&&(c.lanes|=n),ya(o.return,n,e),r||(s=null);break a}o=c.next}}else if(a.tag===18){if(s=a.return,s===null)throw Error(i(341));s.lanes|=n,o=s.alternate,o!==null&&(o.lanes|=n),ya(s,n,e),s=null}else a.tag===13&&a.memoizedState!==null&&a.memoizedState.dehydrated===null?(a.lanes|=n,s=a.alternate,s!==null&&(s.lanes|=n),ya(a.return,n,e),s=a.child,s=s===null?null:s.sibling):s=a.child;if(s!==null)s.return=a;else for(s=a;s!==null;){if(s===e){s=null;break}if(a=s.sibling,a!==null){a.return=s.return,s=a;break}s=s.return}a=s}}function xa(e,t,n,r){e=null;for(var a=t,o=!1;a!==null;){if(!o){if(a.flags&524288)o=!0;else if(a.flags&262144)break}if(a.tag===10){var s=a.alternate;if(s===null)throw Error(i(387));if(s=s.memoizedProps,s!==null){var c=a.type;Br(a.pendingProps.value,s.value)||(e===null?e=[c]:e.push(c))}}else if(a===Se.current){if(s=a.alternate,s===null)throw Error(i(387));s.memoizedState.memoizedState!==a.memoizedState.memoizedState&&(e===null?e=[sh]:e.push(sh))}a=a.return}return e!==null&&ba(t,e,n,r),t.flags|=262144,e!==null}function Sa(e){for(e=e.firstContext;e!==null;){if(!Br(e.context._currentValue,e.memoizedValue))return!0;e=e.next}return!1}function Ca(e){ha=e,ga=null,e=e.dependencies,e!==null&&(e.firstContext=null)}function wa(e){return Ea(ha,e)}function Ta(e,t){return ha===null&&Ca(e),Ea(e,t)}function Ea(e,t){var n=t._currentValue;if(t={context:t,memoizedValue:n,next:null},ga===null){if(e===null)throw Error(i(308));ga=t,e.dependencies={lanes:0,firstContext:t},e.flags|=524288}else ga=ga.next=t;return n}var Da=typeof AbortController<`u`?AbortController:function(){var e=[],t=this.signal={aborted:!1,addEventListener:function(t,n){e.push(n)}};this.abort=function(){t.aborted=!0,e.forEach(function(e){return e()})}},Oa=t.unstable_scheduleCallback,ka=t.unstable_NormalPriority,Aa={$$typeof:N,Consumer:null,Provider:null,_currentValue:null,_currentValue2:null,_threadCount:0};function ja(){return{controller:new Da,data:new Map,refCount:0}}function Ma(e){e.refCount--,e.refCount===0&&Oa(ka,function(){e.controller.abort()})}function Na(e,t){if(e.pendingLanes&4194048){var n=e.transitionTypes;for(n===null&&(n=e.transitionTypes=[]),e=0;e<t.length;e++){var r=t[e];n.indexOf(r)===-1&&n.push(r)}}}var Pa=null;function Fa(e){var t=e.transitionTypes;return e.transitionTypes=null,t}var Ia=null,La=0,Ra=0,za=null;function Ba(e,t){if(Ia===null){var n=Ia=[];La=0,Ra=Pf(),za={status:`pending`,value:void 0,then:function(e){n.push(e)}}}return La++,t.then(Va,Va),t}function Va(){if(--La===0&&(Pa=null,Ia!==null)){za!==null&&(za.status=`fulfilled`);var e=Ia;Ia=null,Ra=0,za=null;for(var t=0;t<e.length;t++)(0,e[t])()}}function Ha(e,t){var n=[],r={status:`pending`,value:null,reason:null,then:function(e){n.push(e)}};return e.then(function(){r.status=`fulfilled`,r.value=t;for(var e=0;e<n.length;e++)(0,n[e])(t)},function(e){for(r.status=`rejected`,r.reason=e,e=0;e<n.length;e++)(0,n[e])(void 0)}),r}var Ua=F.S;F.S=function(e,t){if(md=ze(),typeof t==`object`&&t&&typeof t.then==`function`&&Ba(e,t),Pa!==null)for(var n=bf;n!==null;)Na(n,Pa),n=n.next;if(n=e.types,n!==null){for(var r=bf;r!==null;)Na(r,n),r=r.next;if(Ra!==0){r=Pa,r===null&&(r=Pa=[]);for(var i=0;i<n.length;i++){var a=n[i];r.indexOf(a)===-1&&r.push(a)}}}Ua!==null&&Ua(e,t)};var Wa=ye(null);function Ga(){var e=Wa.current;return e===null?Qu.pooledCache:e}function Ka(e,t){t===null?R(Wa,Wa.current):R(Wa,t.pool)}function qa(){var e=Ga();return e===null?null:{parent:Aa._currentValue,pool:e}}var Ja=Error(i(460)),Ya=Error(i(474)),Xa=Error(i(542)),Za={then:function(){}};function Qa(e){return e=e.status,e===`fulfilled`||e===`rejected`}function $a(e,t,n){switch(n=e[n],n===void 0?e.push(t):n!==t&&(t.then(_n,_n),t=n),t.status){case`fulfilled`:return t.value;case`rejected`:throw e=t.reason,ro(e),e===void 0&&!(`reason`in t)?Error(i(600)):e;default:if(typeof t.status==`string`)t.then(_n,_n);else{if(e=Qu,e!==null&&100<e.shellSuspendCounter)throw Error(i(482));e=t,e.status=`pending`,e.then(function(e){if(t.status===`pending`){var n=t;n.status=`fulfilled`,n.value=e}},function(e){if(t.status===`pending`){var n=t;n.status=`rejected`,n.reason=e}})}switch(t.status){case`fulfilled`:return t.value;case`rejected`:throw e=t.reason,ro(e),e}throw to=t,Ja}}function eo(e){try{var t=e._init;return t(e._payload)}catch(e){throw typeof e==`object`&&e&&typeof e.then==`function`?(to=e,Ja):e}}var to=null;function no(){if(to===null)throw Error(i(459));var e=to;return to=null,e}function ro(e){if(e===Ja||e===Xa)throw Error(i(483))}var io=null,ao=0;function oo(e){var t=ao;return ao+=1,io===null&&(io=[]),$a(io,e,t)}function so(e,t){t=t.props.ref,e.ref=t===void 0?null:t}function co(e,t){throw t.$$typeof===O?Error(i(525)):(e=Object.prototype.toString.call(t),Error(i(31,e===`[object Object]`?`object with keys {`+Object.keys(t).join(`, `)+`}`:e)))}function lo(e){function t(t,n){if(e){var r=t.deletions;r===null?(t.deletions=[n],t.flags|=16):r.push(n)}}function n(n,r){if(!e)return null;for(;r!==null;)t(n,r),r=r.sibling;return null}function r(e){for(var t=new Map;e!==null;)e.key===null?t.set(e.index,e):t.set(e.key,e),e=e.sibling;return t}function a(e,t){return e=Ni(e,t),e.index=0,e.sibling=null,e}function o(t,n,r){return t.index=r,e?(r=t.alternate,r===null?(t.flags|=134217730,n):(r=r.index,r<n?(t.flags|=2,n):r)):(t.flags|=1048576,n)}function s(t){return e&&t.alternate===null&&(t.flags|=134217730),t}function c(e,t,n,r){return t===null||t.tag!==6?(t=Li(n,e.mode,r),t.return=e,t):(t=a(t,n),t.return=e,t)}function l(e,t,n,r){var i=n.type;return i===j?(e=d(e,t,n.props.children,r,n.key),so(e,n),e):t!==null&&(t.elementType===i||typeof i==`object`&&i&&i.$$typeof===ae&&eo(i)===t.type)?(t=a(t,n.props),so(t,n),t.return=e,t):(t=Fi(n.type,n.key,n.props,null,e.mode,r),so(t,n),t.return=e,t)}function u(e,t,n,r){return t===null||t.tag!==4||t.stateNode.containerInfo!==n.containerInfo||t.stateNode.implementation!==n.implementation?(t=zi(n,e.mode,r),t.return=e,t):(t=a(t,n.children||[]),t.return=e,t)}function d(e,t,n,r,i){return t===null||t.tag!==7?(t=Ii(n,e.mode,r,i),t.return=e,t):(t=a(t,n),t.return=e,t)}function f(e,t,n){if(typeof t==`string`&&t!==``||typeof t==`number`||typeof t==`bigint`)return t=Li(``+t,e.mode,n),t.return=e,t;if(typeof t==`object`&&t){switch(t.$$typeof){case k:return n=Fi(t.type,t.key,t.props,null,e.mode,n),so(n,t),n.return=e,n;case A:return t=zi(t,e.mode,n),t.return=e,t;case ae:return t=eo(t),f(e,t,n)}if(he(t)||fe(t))return t=Ii(t,e.mode,n,null),t.return=e,t;if(typeof t.then==`function`)return f(e,oo(t),n);if(t.$$typeof===N)return f(e,Ta(e,t),n);co(e,t)}return null}function p(e,t,n,r){var i=t===null?null:t.key;if(typeof n==`string`&&n!==``||typeof n==`number`||typeof n==`bigint`)return i===null?c(e,t,``+n,r):null;if(typeof n==`object`&&n){switch(n.$$typeof){case k:return n.key===i?l(e,t,n,r):null;case A:return n.key===i?u(e,t,n,r):null;case ae:return n=eo(n),p(e,t,n,r)}if(he(n)||fe(n))return i===null?d(e,t,n,r,null):null;if(typeof n.then==`function`)return p(e,t,oo(n),r);if(n.$$typeof===N)return p(e,t,Ta(e,n),r);co(e,n)}return null}function m(e,t,n,r,i){if(typeof r==`string`&&r!==``||typeof r==`number`||typeof r==`bigint`)return e=e.get(n)||null,c(t,e,``+r,i);if(typeof r==`object`&&r){switch(r.$$typeof){case k:return e=e.get(r.key===null?n:r.key)||null,l(t,e,r,i);case A:return e=e.get(r.key===null?n:r.key)||null,u(t,e,r,i);case ae:return r=eo(r),m(e,t,n,r,i)}if(he(r)||fe(r))return e=e.get(n)||null,d(t,e,r,i,null);if(typeof r.then==`function`)return m(e,t,n,oo(r),i);if(r.$$typeof===N)return m(e,t,n,Ta(t,r),i);co(t,r)}return null}function h(i,a,s,c){for(var l=null,u=null,d=a,h=a=0,g=null;d!==null&&h<s.length;h++){d.index>h?(g=d,d=null):g=d.sibling;var _=p(i,d,s[h],c);if(_===null){d===null&&(d=g);break}e&&d&&_.alternate===null&&t(i,d),a=o(_,a,h),u===null?l=_:u.sibling=_,u=_,d=g}if(h===s.length)return n(i,d),V&&Zi(i,h),l;if(d===null){for(;h<s.length;h++)d=f(i,s[h],c),d!==null&&(a=o(d,a,h),u===null?l=d:u.sibling=d,u=d);return V&&Zi(i,h),l}for(d=r(d);h<s.length;h++)g=m(d,i,h,s[h],c),g!==null&&(e&&(_=g.alternate,_!==null&&d.delete(_.key===null?h:_.key)),a=o(g,a,h),u===null?l=g:u.sibling=g,u=g);return e&&d.forEach(function(e){return t(i,e)}),V&&Zi(i,h),l}function g(a,s,c,l){if(c==null)throw Error(i(151));for(var u=null,d=null,h=s,g=s=0,_=null,v=c.next();h!==null&&!v.done;g++,v=c.next()){h.index>g?(_=h,h=null):_=h.sibling;var y=p(a,h,v.value,l);if(y===null){h===null&&(h=_);break}e&&h&&y.alternate===null&&t(a,h),s=o(y,s,g),d===null?u=y:d.sibling=y,d=y,h=_}if(v.done)return n(a,h),V&&Zi(a,g),u;if(h===null){for(;!v.done;g++,v=c.next())v=f(a,v.value,l),v!==null&&(s=o(v,s,g),d===null?u=v:d.sibling=v,d=v);return V&&Zi(a,g),u}for(h=r(h);!v.done;g++,v=c.next())v=m(h,a,g,v.value,l),v!==null&&(e&&(_=v.alternate,_!==null&&h.delete(_.key===null?g:_.key)),s=o(v,s,g),d===null?u=v:d.sibling=v,d=v);return e&&h.forEach(function(e){return t(a,e)}),V&&Zi(a,g),u}function _(e,r,o,c){if(typeof o==`object`&&o&&o.type===j&&o.key===null&&o.props.ref===void 0&&(o=o.props.children),typeof o==`object`&&o){switch(o.$$typeof){case k:a:{for(var l=o.key;r!==null;){if(r.key===l){if(l=o.type,l===j){if(r.tag===7){n(e,r.sibling),c=a(r,o.props.children),so(c,o),c.return=e,e=c;break a}}else if(r.elementType===l||typeof l==`object`&&l&&l.$$typeof===ae&&eo(l)===r.type){n(e,r.sibling),c=a(r,o.props),so(c,o),c.return=e,e=c;break a}n(e,r);break}t(e,r),r=r.sibling}o.type===j?(c=Ii(o.props.children,e.mode,c,o.key),so(c,o),c.return=e,e=c):(c=Fi(o.type,o.key,o.props,null,e.mode,c),so(c,o),c.return=e,e=c)}return s(e);case A:a:{for(l=o.key;r!==null;){if(r.key===l){if(r.tag===4&&r.stateNode.containerInfo===o.containerInfo&&r.stateNode.implementation===o.implementation){n(e,r.sibling),c=a(r,o.children||[]),c.return=e,e=c;break a}n(e,r);break}t(e,r),r=r.sibling}c=zi(o,e.mode,c),c.return=e,e=c}return s(e);case ae:return o=eo(o),_(e,r,o,c)}if(he(o))return h(e,r,o,c);if(fe(o)){if(l=fe(o),typeof l!=`function`)throw Error(i(150));return o=l.call(o),g(e,r,o,c)}if(typeof o.then==`function`)return _(e,r,oo(o),c);if(o.$$typeof===N)return _(e,r,Ta(e,o),c);co(e,o)}return typeof o==`string`&&o!==``||typeof o==`number`||typeof o==`bigint`?(o=``+o,r!==null&&r.tag===6?(n(e,r.sibling),c=a(r,o),c.return=e,e=c):(n(e,r),c=Li(o,e.mode,c),c.return=e,e=c),s(e)):n(e,r)}return function(e,t,n,r){try{ao=0;var i=_(e,t,n,r);return io=null,i}catch(t){if(t===Ja||t===Xa)throw t;var a=ji(29,t,null,e.mode);return a.lanes=r,a.return=e,a}}}var uo=lo(!0),fo=lo(!1),H=!1;function po(e){e.updateQueue={baseState:e.memoizedState,firstBaseUpdate:null,lastBaseUpdate:null,shared:{pending:null,lanes:0,hiddenCallbacks:null},callbacks:null}}function mo(e,t){e=e.updateQueue,t.updateQueue===e&&(t.updateQueue={baseState:e.baseState,firstBaseUpdate:e.firstBaseUpdate,lastBaseUpdate:e.lastBaseUpdate,shared:e.shared,callbacks:null})}function ho(e){return{lane:e,tag:0,payload:null,callback:null,next:null}}function go(e,t,n){var r=e.updateQueue;if(r===null)return null;if(r=r.shared,J&2){var i=r.pending;return i===null?t.next=t:(t.next=i.next,i.next=t),r.pending=t,t=Oi(e),Di(e,null,n),t}return wi(e,r,t,n),Oi(e)}function _o(e,t,n){if(t=t.updateQueue,t!==null&&(t=t.shared,n&4194048)){var r=t.lanes;r&=e.pendingLanes,n|=r,t.lanes=n,mt(e,n)}}function vo(e,t){var n=e.updateQueue,r=e.alternate;if(r!==null&&(r=r.updateQueue,n===r)){var i=null,a=null;if(n=n.firstBaseUpdate,n!==null){do{var o={lane:n.lane,tag:n.tag,payload:n.payload,callback:null,next:null};a===null?i=a=o:a=a.next=o,n=n.next}while(n!==null);a===null?i=a=t:a=a.next=t}else i=a=t;n={baseState:r.baseState,firstBaseUpdate:i,lastBaseUpdate:a,shared:r.shared,callbacks:r.callbacks},e.updateQueue=n}else e=n.lastBaseUpdate,e===null?n.firstBaseUpdate=t:e.next=t,n.lastBaseUpdate=t}var yo=!1;function bo(){if(yo){var e=za;if(e!==null)throw e}}function xo(e,t,n,r){yo=!1;var i=e.updateQueue;H=!1;var a=i.firstBaseUpdate,o=i.lastBaseUpdate,s=i.shared.pending;if(s!==null){i.shared.pending=null;var c=s,l=c.next;c.next=null,o===null?a=l:o.next=l,o=c;var u=e.alternate;u!==null&&(u=u.updateQueue,s=u.lastBaseUpdate,s!==o&&(s===null?u.firstBaseUpdate=l:s.next=l,u.lastBaseUpdate=c))}if(a!==null){var d=i.baseState;o=0,u=l=c=null,s=a;do{var f=s.lane&-536870913,p=f!==s.lane;if(p?(X&f)===f:(r&f)===f){f!==0&&f===Ra&&(yo=!0),u!==null&&(u=u.next={lane:0,tag:s.tag,payload:s.payload,callback:null,next:null});a:{var m=e,h=s;f=t;var g=n;switch(h.tag){case 1:if(m=h.payload,typeof m==`function`){d=m.call(g,d,f);break a}d=m;break a;case 3:m.flags=m.flags&-65537|128;case 0:if(m=h.payload,f=typeof m==`function`?m.call(g,d,f):m,f==null)break a;d=D({},d,f);break a;case 2:H=!0}}f=s.callback,f!==null&&(e.flags|=64,p&&(e.flags|=8192),p=i.callbacks,p===null?i.callbacks=[f]:p.push(f))}else p={lane:f,tag:s.tag,payload:s.payload,callback:s.callback,next:null},u===null?(l=u=p,c=d):u=u.next=p,o|=f;if(s=s.next,s===null){if(s=i.shared.pending,s===null)break;p=s,s=p.next,p.next=null,i.lastBaseUpdate=p,i.shared.pending=null}}while(1);u===null&&(c=d),i.baseState=c,i.firstBaseUpdate=l,i.lastBaseUpdate=u,a===null&&(i.shared.lanes=0),ad|=o,e.lanes=o,e.memoizedState=d}}function So(e,t){if(typeof e!=`function`)throw Error(i(191,e));e.call(t)}function Co(e,t){var n=e.callbacks;if(n!==null)for(e.callbacks=null,e=0;e<n.length;e++)So(n[e],t)}var wo=ye(null),To=ye(0);function Eo(e,t){e=rd,R(To,e),R(wo,t),rd=e|t.baseLanes}function Do(){R(To,rd),R(wo,wo.current)}function Oo(){rd=To.current,L(wo),L(To)}var ko=ye(null),Ao=null;function jo(e){var t=e.alternate;R(Io,Io.current&1),R(ko,e),Ao===null&&(t===null||wo.current!==null||t.memoizedState!==null)&&(Ao=e)}function Mo(e){R(Io,Io.current),R(ko,e),Ao===null&&(Ao=e)}function No(e){e.tag===22?(R(Io,Io.current),R(ko,e),Ao===null&&(Ao=e)):Po()}function Po(){R(Io,Io.current),R(ko,ko.current)}function Fo(e){L(ko),Ao===e&&(Ao=null),L(Io)}var Io=ye(0);function Lo(e,t){R(ko,ko.current),R(Io,t)}function Ro(e){L(Io),L(ko),Ao===e&&(Ao=null)}function zo(e){for(var t=e;t!==null;){if(t.tag===13){var n=t.memoizedState;if(n!==null&&(n=n.dehydrated,n===null||om(n)||sm(n)))return t}else if(t.tag===19&&t.memoizedProps.revealOrder!==`independent`){if(t.flags&128)return t}else if(t.child!==null){t.child.return=t,t=t.child;continue}if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return null;t=t.return}t.sibling.return=t.return,t=t.sibling}return null}var Bo=0,U=null,W=null,Vo=null,Ho=!1,Uo=!1,Wo=!1,Go=0,Ko=0,qo=null,Jo=0;function G(){throw Error(i(321))}function Yo(e,t){if(t===null)return!1;for(var n=0;n<t.length&&n<e.length;n++)if(!Br(e[n],t[n]))return!1;return!0}function Xo(e,t,n,r,i,a){return Bo=a,U=t,t.memoizedState=null,t.updateQueue=null,t.lanes=0,F.H=e===null||e.memoizedState===null?pc:mc,Wo=!1,a=n(r,i),Wo=!1,Uo&&(a=Qo(t,n,r,i)),Zo(e),a}function Zo(e){F.H=fc;var t=W!==null&&W.next!==null;if(Bo=0,Vo=W=U=null,Ho=!1,Ko=0,qo=null,t)throw Error(i(300));e===null||jc||(e=e.dependencies,e!==null&&Sa(e)&&(jc=!0))}function Qo(e,t,n,r){U=e;var a=0;do{if(Uo&&(qo=null),Ko=0,Uo=!1,25<=a)throw Error(i(301));if(a+=1,Vo=W=null,e.updateQueue!=null){var o=e.updateQueue;o.lastEffect=null,o.events=null,o.stores=null,o.memoCache!=null&&(o.memoCache.index=0)}F.H=hc,o=t(n,r)}while(Uo);return o}function $o(){var e=F.H,t=e.useState()[0];return t=typeof t.then==`function`?os(t):t,e=e.useState()[0],(W===null?null:W.memoizedState)!==e&&(U.flags|=1024),t}function es(){var e=Go!==0;return Go=0,e}function ts(e,t,n){t.updateQueue=e.updateQueue,t.flags&=-2053,e.lanes&=~n}function ns(e){if(Ho){for(e=e.memoizedState;e!==null;){var t=e.queue;t!==null&&(t.pending=null),e=e.next}Ho=!1}Bo=0,Vo=W=U=null,Uo=!1,Ko=Go=0,qo=null}function rs(){var e={memoizedState:null,baseState:null,baseQueue:null,queue:null,next:null};return Vo===null?U.memoizedState=Vo=e:Vo=Vo.next=e,Vo}function is(){if(W===null){var e=U.alternate;e=e===null?null:e.memoizedState}else e=W.next;var t=Vo===null?U.memoizedState:Vo.next;if(t!==null)Vo=t,W=e;else{if(e===null)throw U.alternate===null?Error(i(467)):Error(i(310));W=e,e={memoizedState:W.memoizedState,baseState:W.baseState,baseQueue:W.baseQueue,queue:W.queue,next:null},Vo===null?U.memoizedState=Vo=e:Vo=Vo.next=e}return Vo}function as(){return{lastEffect:null,events:null,stores:null,memoCache:null}}function os(e){var t=Ko;return Ko+=1,qo===null&&(qo=[]),e=$a(qo,e,t),t=U,(Vo===null?t.memoizedState:Vo.next)===null&&(t=t.alternate,F.H=t===null||t.memoizedState===null?pc:mc),e}function ss(e){if(typeof e==`object`&&e){if(typeof e.then==`function`)return os(e);if(e.$$typeof===ue)return;if(e.$$typeof===N)return wa(e)}throw Error(i(438,String(e)))}function cs(e){var t=null,n=U.updateQueue;if(n!==null&&(t=n.memoCache),t==null){var r=U.alternate;r!==null&&(r=r.updateQueue,r!==null&&(r=r.memoCache,r!=null&&(t={data:r.data.map(function(e){return e.slice()}),index:0})))}if(t??={data:[],index:0},n===null&&(n=as(),U.updateQueue=n),n.memoCache=t,n=t.data[t.index],n===void 0)for(n=t.data[t.index]=Array(e),r=0;r<e;r++)n[r]=ce;return t.index++,n}function ls(e,t){return typeof t==`function`?t(e):t}function us(e){return ds(is(),W,e)}function ds(e,t,n){var r=e.queue;if(r===null)throw Error(i(311));r.lastRenderedReducer=n;var a=e.baseQueue,o=r.pending;if(o!==null){if(a!==null){var s=a.next;a.next=o.next,o.next=s}t.baseQueue=a=o,r.pending=null}if(o=e.baseState,a===null)e.memoizedState=o;else{t=a.next;var c=s=null,l=null,u=t,d=!1;do{var f=u.lane&-536870913;if(f===u.lane?(Bo&f)===f:(X&f)===f){var p=u.revertLane;if(p===0)l!==null&&(l=l.next={lane:0,revertLane:0,gesture:null,action:u.action,hasEagerState:u.hasEagerState,eagerState:u.eagerState,next:null}),f===Ra&&(d=!0);else if((Bo&p)===p){u=u.next,p===Ra&&(d=!0);continue}else f={lane:0,revertLane:u.revertLane,gesture:null,action:u.action,hasEagerState:u.hasEagerState,eagerState:u.eagerState,next:null},l===null?(c=l=f,s=o):l=l.next=f,U.lanes|=p,ad|=p;f=u.action,Wo&&n(o,f),o=u.hasEagerState?u.eagerState:n(o,f)}else p={lane:f,revertLane:u.revertLane,gesture:u.gesture,action:u.action,hasEagerState:u.hasEagerState,eagerState:u.eagerState,next:null},l===null?(c=l=p,s=o):l=l.next=p,U.lanes|=f,ad|=f;u=u.next}while(u!==null&&u!==t);if(l===null?s=o:l.next=c,!Br(o,e.memoizedState)&&(jc=!0,d&&(n=za,n!==null)))throw n;e.memoizedState=o,e.baseState=s,e.baseQueue=l,r.lastRenderedState=o}return a===null&&(r.lanes=0),[e.memoizedState,r.dispatch]}function fs(e){var t=is(),n=t.queue;if(n===null)throw Error(i(311));n.lastRenderedReducer=e;var r=n.dispatch,a=n.pending,o=t.memoizedState;if(a!==null){n.pending=null;var s=a=a.next;do o=e(o,s.action),s=s.next;while(s!==a);Br(o,t.memoizedState)||(jc=!0),t.memoizedState=o,t.baseQueue===null&&(t.baseState=o),n.lastRenderedState=o}return[o,r]}function ps(e,t,n){var r=U,a=is(),o=V;if(o){if(n===void 0)throw Error(i(407));n=n()}else n=t();var s=!Br((W||a).memoizedState,n);if(s&&(a.memoizedState=n,jc=!0),a=a.queue,Rs(gs.bind(null,r,a,e),[e]),e=a.getSnapshot!==t||s||Vo!==null&&!!(Vo.memoizedState.tag&1),Ns(e?9:8,{destroy:void 0},hs.bind(null,r,a,n,t),null),e){if(r.flags|=2048,Qu===null)throw Error(i(349));o||Bo&127||ms(r,t,n)}return n}function ms(e,t,n){e.flags|=16384,e={getSnapshot:t,value:n},t=U.updateQueue,t===null?(t=as(),U.updateQueue=t,t.stores=[e]):(n=t.stores,n===null?t.stores=[e]:n.push(e))}function hs(e,t,n,r){t.value=n,t.getSnapshot=r,_s(t)&&vs(e)}function gs(e,t,n){return n(function(){_s(t)&&vs(e)})}function _s(e){var t=e.getSnapshot;e=e.value;try{var n=t();return!Br(e,n)}catch{return!0}}function vs(e){var t=Ei(e,2);t!==null&&Nd(t,e,2)}function ys(e){var t=rs();if(typeof e==`function`){var n=e;if(e=n(),Wo){Xe(!0);try{n()}finally{Xe(!1)}}}return t.memoizedState=t.baseState=e,t.queue={pending:null,lanes:0,dispatch:null,lastRenderedReducer:ls,lastRenderedState:e},t}function bs(e,t,n,r){return e.baseState=n,ds(e,W,typeof r==`function`?r:ls)}function xs(e,t,n,r,a){if(lc(e))throw Error(i(485));if(e=t.action,e!==null){var o={payload:a,action:e,next:null,isTransition:!0,status:`pending`,value:null,reason:null,listeners:[],then:function(e){o.listeners.push(e)}};F.T===null?o.isTransition=!1:n(!0),r(o),n=t.pending,n===null?(o.next=t.pending=o,Ss(t,o)):(o.next=n.next,t.pending=n.next=o)}}function Ss(e,t){var n=t.action,r=t.payload,i=e.state;if(t.isTransition){var a=F.T,o={};o.types=a===null?null:a.types,F.T=o;try{var s=n(i,r),c=F.S;c!==null&&c(o,s),Cs(e,t,s)}catch(n){Ts(e,t,n)}finally{a!==null&&o.types!==null&&(a.types=o.types),F.T=a}}else try{a=n(i,r),Cs(e,t,a)}catch(n){Ts(e,t,n)}}function Cs(e,t,n){typeof n==`object`&&n&&typeof n.then==`function`?n.then(function(n){ws(e,t,n)},function(n){return Ts(e,t,n)}):ws(e,t,n)}function ws(e,t,n){t.status=`fulfilled`,t.value=n,Es(t),e.state=n,t=e.pending,t!==null&&(n=t.next,n===t?e.pending=null:(n=n.next,t.next=n,Ss(e,n)))}function Ts(e,t,n){var r=e.pending;if(e.pending=null,r!==null){r=r.next;do t.status=`rejected`,t.reason=n,Es(t),t=t.next;while(t!==r)}e.action=null}function Es(e){e=e.listeners;for(var t=0;t<e.length;t++)(0,e[t])()}function Ds(e,t){return t}function Os(e,t){if(V){var n=Qu.formState;if(n!==null){a:{var r=U;if(V){if(ra){b:{for(var i=ra,a=aa;i.nodeType!==8;)if(!a||(i=lm(i.nextSibling),i===null)){i=null;break b}a=i.data,i=a===`F!`||a===`F`?i:null}if(i){ra=lm(i.nextSibling),r=i.data===`F!`;break a}}sa(r)}r=!1}r&&(t=n[0])}}return n=rs(),n.memoizedState=n.baseState=t,r={pending:null,lanes:0,dispatch:null,lastRenderedReducer:Ds,lastRenderedState:t},n.queue=r,n=oc.bind(null,U,r),r.dispatch=n,r=ys(!1),a=cc.bind(null,U,!1,r.queue),r=rs(),i={state:t,dispatch:null,action:e,pending:null},r.queue=i,n=xs.bind(null,U,i,a,n),i.dispatch=n,r.memoizedState=e,[t,n,!1]}function ks(e){return As(is(),W,e)}function As(e,t,n){if(t=ds(e,t,Ds)[0],e=us(ls)[0],typeof t==`object`&&t&&typeof t.then==`function`)try{var r=os(t)}catch(e){throw e===Ja?Xa:e}else r=t;t=is();var i=t.queue,a=i.dispatch;return n!==t.memoizedState&&(U.flags|=2048,Ns(9,{destroy:void 0},js.bind(null,i,n),null)),[r,a,e]}function js(e,t){e.action=t}function Ms(e){var t=is(),n=W;if(n!==null)return As(t,n,e);is(),t=t.memoizedState,n=is();var r=n.queue.dispatch;return n.memoizedState=e,[t,r,!1]}function Ns(e,t,n,r){return e={tag:e,create:n,deps:r,inst:t,next:null},t=U.updateQueue,t===null&&(t=as(),U.updateQueue=t),n=t.lastEffect,n===null?t.lastEffect=e.next=e:(r=n.next,n.next=e,e.next=r,t.lastEffect=e),e}function Ps(){return is().memoizedState}function Fs(e,t,n,r){var i=rs();U.flags|=e,i.memoizedState=Ns(1|t,{destroy:void 0},n,r===void 0?null:r)}function Is(e,t,n,r){var i=is();r=r===void 0?null:r;var a=i.memoizedState.inst;W!==null&&r!==null&&Yo(r,W.memoizedState.deps)?i.memoizedState=Ns(t,a,n,r):(U.flags|=e,i.memoizedState=Ns(1|t,a,n,r))}function Ls(e,t){Fs(8390656,8,e,t)}function Rs(e,t){Is(2048,8,e,t)}function zs(e){U.flags|=4;var t=U.updateQueue;if(t===null)t=as(),U.updateQueue=t,t.events=[e];else{var n=t.events;n===null?t.events=[e]:n.push(e)}}function Bs(e){var t=is().memoizedState;return zs({ref:t,nextImpl:e}),function(){if(J&2)throw Error(i(440));return t.impl.apply(void 0,arguments)}}function Vs(e,t){return Is(4,2,e,t)}function Hs(e,t){return Is(4,4,e,t)}function Us(e,t){if(typeof t==`function`){e=e();var n=t(e);return function(){typeof n==`function`?n():t(null)}}if(t!=null)return e=e(),t.current=e,function(){t.current=null}}function Ws(e,t,n){n=n==null?null:n.concat([e]),Is(4,4,Us.bind(null,t,e),n)}function Gs(){}function Ks(e,t){var n=is();t=t===void 0?null:t;var r=n.memoizedState;return t!==null&&Yo(t,r[1])?r[0]:(n.memoizedState=[e,t],e)}function qs(e,t){var n=is();t=t===void 0?null:t;var r=n.memoizedState;if(t!==null&&Yo(t,r[1]))return r[0];if(r=e(),Wo){Xe(!0);try{e()}finally{Xe(!1)}}return n.memoizedState=[r,t],r}function Js(e,t,n){return n===void 0||Bo&1073741824&&!(X&261930)?e.memoizedState=t:(e.memoizedState=n,e=jd(),U.lanes|=e,ad|=e,n)}function Ys(e,t,n,r){return Br(n,t)?n:wo.current===null?!(Bo&106)||Bo&1073741824&&!(X&261930)?(jc=!0,e.memoizedState=n):(e=jd(),U.lanes|=e,ad|=e,t):(e=Js(e,n,r),Br(e,t)||(jc=!0),e)}function Xs(e,t,n,r,i){var a=I.p;I.p=a!==0&&8>a?a:8;var o=F.T,s={};s.types=o===null?null:o.types,F.T=s,cc(e,!1,t,n);try{var c=i(),l=F.S;l!==null&&l(s,c),typeof c==`object`&&c&&typeof c.then==`function`?sc(e,t,Ha(c,r),Ad(e)):sc(e,t,r,Ad(e))}catch(n){sc(e,t,{then:function(){},status:`rejected`,reason:n},Ad())}finally{I.p=a,o!==null&&s.types!==null&&(o.types=s.types),F.T=o}}function Zs(){}function Qs(e,t,n,r){if(e.tag!==5)throw Error(i(476));var a=$s(e).queue;Xs(e,a,t,ge,n===null?Zs:function(){return ec(e),n(r)})}function $s(e){var t=e.memoizedState;if(t!==null)return t;t={memoizedState:ge,baseState:ge,baseQueue:null,queue:{pending:null,lanes:0,dispatch:null,lastRenderedReducer:ls,lastRenderedState:ge},next:null};var n={};return t.next={memoizedState:n,baseState:n,baseQueue:null,queue:{pending:null,lanes:0,dispatch:null,lastRenderedReducer:ls,lastRenderedState:n},next:null},e.memoizedState=t,e=e.alternate,e!==null&&(e.memoizedState=t),t}function ec(e){var t=$s(e);t.next===null&&(t=e.alternate.memoizedState),sc(e,t.next.queue,{},Ad())}function tc(){return wa(sh)}function nc(){return is().memoizedState}function rc(){return is().memoizedState}function ic(e){for(var t=e.return;t!==null;){switch(t.tag){case 24:case 3:var n=Ad();e=ho(n);var r=go(t,e,n);r!==null&&(Nd(r,t,n),_o(r,t,n)),t={cache:ja()},e.payload=t;return}t=t.return}}function ac(e,t,n){var r=Ad();n={lane:r,revertLane:0,gesture:null,action:n,hasEagerState:!1,eagerState:null,next:null},lc(e)?uc(t,n):(n=Ti(e,t,n,r),n!==null&&(Nd(n,e,r),dc(n,t,r)))}function oc(e,t,n){sc(e,t,n,Ad())}function sc(e,t,n,r){var i={lane:r,revertLane:0,gesture:null,action:n,hasEagerState:!1,eagerState:null,next:null};if(lc(e))uc(t,i);else{var a=e.alternate;if(e.lanes===0&&(a===null||a.lanes===0)&&(a=t.lastRenderedReducer,a!==null))try{var o=t.lastRenderedState,s=a(o,n);if(i.hasEagerState=!0,i.eagerState=s,Br(s,o))return wi(e,t,i,0),Qu===null&&Ci(),!1}catch{}if(n=Ti(e,t,i,r),n!==null)return Nd(n,e,r),dc(n,t,r),!0}return!1}function cc(e,t,n,r){if(r={lane:2,revertLane:Pf(),gesture:null,action:r,hasEagerState:!1,eagerState:null,next:null},lc(e)){if(t)throw Error(i(479))}else t=Ti(e,n,r,2),t!==null&&Nd(t,e,2)}function lc(e){var t=e.alternate;return e===U||t!==null&&t===U}function uc(e,t){Uo=Ho=!0;var n=e.pending;n===null?t.next=t:(t.next=n.next,n.next=t),e.pending=t}function dc(e,t,n){if(n&4194048){var r=t.lanes;r&=e.pendingLanes,n|=r,t.lanes=n,mt(e,n)}}var fc={readContext:wa,use:ss,useCallback:G,useContext:G,useEffect:G,useImperativeHandle:G,useLayoutEffect:G,useInsertionEffect:G,useMemo:G,useReducer:G,useRef:G,useState:G,useDebugValue:G,useDeferredValue:G,useTransition:G,useSyncExternalStore:G,useId:G,useHostTransitionStatus:G,useFormState:G,useActionState:G,useOptimistic:G,useMemoCache:G,useCacheRefresh:G,useEffectEvent:G},pc={readContext:wa,use:ss,useCallback:function(e,t){return rs().memoizedState=[e,t===void 0?null:t],e},useContext:wa,useEffect:Ls,useImperativeHandle:function(e,t,n){n=n==null?null:n.concat([e]),Fs(4194308,4,Us.bind(null,t,e),n)},useLayoutEffect:function(e,t){return Fs(4194308,4,e,t)},useInsertionEffect:function(e,t){Fs(4,2,e,t)},useMemo:function(e,t){var n=rs();t=t===void 0?null:t;var r=e();if(Wo){Xe(!0);try{e()}finally{Xe(!1)}}return n.memoizedState=[r,t],r},useReducer:function(e,t,n){var r=rs();if(n!==void 0){var i=n(t);if(Wo){Xe(!0);try{n(t)}finally{Xe(!1)}}}else i=t;return r.memoizedState=r.baseState=i,e={pending:null,lanes:0,dispatch:null,lastRenderedReducer:e,lastRenderedState:i},r.queue=e,e=e.dispatch=ac.bind(null,U,e),[r.memoizedState,e]},useRef:function(e){var t=rs();return e={current:e},t.memoizedState=e},useState:function(e){e=ys(e);var t=e.queue,n=oc.bind(null,U,t);return t.dispatch=n,[e.memoizedState,n]},useDebugValue:Gs,useDeferredValue:function(e,t){return Js(rs(),e,t)},useTransition:function(){var e=ys(!1);return e=Xs.bind(null,U,e.queue,!0,!1),rs().memoizedState=e,[!1,e]},useSyncExternalStore:function(e,t,n){var r=U,a=rs();if(V){if(n===void 0)throw Error(i(407));n=n()}else{if(n=t(),Qu===null)throw Error(i(349));X&127||ms(r,t,n)}a.memoizedState=n;var o={value:n,getSnapshot:t};return a.queue=o,Ls(gs.bind(null,r,o,e),[e]),r.flags|=2048,Ns(9,{destroy:void 0},hs.bind(null,r,o,n,t),null),n},useId:function(){var e=rs(),t=Qu.identifierPrefix;if(V){var n=Xi,r=Yi;n=(r&~(1<<32-Ze(r)-1)).toString(32)+n,t=`_`+t+`R_`+n,n=Go++,0<n&&(t+=`H`+n.toString(32)),t+=`_`}else n=Jo++,t=`_`+t+`r_`+n.toString(32)+`_`;return e.memoizedState=t},useHostTransitionStatus:tc,useFormState:Os,useActionState:Os,useOptimistic:function(e){var t=rs();t.memoizedState=t.baseState=e;var n={pending:null,lanes:0,dispatch:null,lastRenderedReducer:null,lastRenderedState:null};return t.queue=n,t=cc.bind(null,U,!0,n),n.dispatch=t,[e,t]},useMemoCache:cs,useCacheRefresh:function(){return rs().memoizedState=ic.bind(null,U)},useEffectEvent:function(e){var t=rs(),n={impl:e};return t.memoizedState=n,function(){if(J&2)throw Error(i(440));return n.impl.apply(void 0,arguments)}}},mc={readContext:wa,use:ss,useCallback:Ks,useContext:wa,useEffect:Rs,useImperativeHandle:Ws,useInsertionEffect:Vs,useLayoutEffect:Hs,useMemo:qs,useReducer:us,useRef:Ps,useState:function(){return us(ls)},useDebugValue:Gs,useDeferredValue:function(e,t){return Ys(is(),W.memoizedState,e,t)},useTransition:function(){var e=us(ls)[0],t=is().memoizedState;return[typeof e==`boolean`?e:os(e),t]},useSyncExternalStore:ps,useId:nc,useHostTransitionStatus:tc,useFormState:ks,useActionState:ks,useOptimistic:function(e,t){return bs(is(),W,e,t)},useMemoCache:cs,useCacheRefresh:rc,useEffectEvent:Bs},hc={readContext:wa,use:ss,useCallback:Ks,useContext:wa,useEffect:Rs,useImperativeHandle:Ws,useInsertionEffect:Vs,useLayoutEffect:Hs,useMemo:qs,useReducer:fs,useRef:Ps,useState:function(){return fs(ls)},useDebugValue:Gs,useDeferredValue:function(e,t){var n=is();return W===null?Js(n,e,t):Ys(n,W.memoizedState,e,t)},useTransition:function(){var e=fs(ls)[0],t=is().memoizedState;return[typeof e==`boolean`?e:os(e),t]},useSyncExternalStore:ps,useId:nc,useHostTransitionStatus:tc,useFormState:Ms,useActionState:Ms,useOptimistic:function(e,t){var n=is();return W===null?(n.baseState=e,[e,n.queue.dispatch]):bs(n,W,e,t)},useMemoCache:cs,useCacheRefresh:rc,useEffectEvent:Bs};function gc(e,t,n,r){t=e.memoizedState,n=n(r,t),n=n==null?t:D({},t,n),e.memoizedState=n,e.lanes===0&&(e.updateQueue.baseState=n)}var _c={enqueueSetState:function(e,t,n){e=e._reactInternals;var r=Ad(),i=ho(r);i.payload=t,n!=null&&(i.callback=n),t=go(e,i,r),t!==null&&(Nd(t,e,r),_o(t,e,r))},enqueueReplaceState:function(e,t,n){e=e._reactInternals;var r=Ad(),i=ho(r);i.tag=1,i.payload=t,n!=null&&(i.callback=n),t=go(e,i,r),t!==null&&(Nd(t,e,r),_o(t,e,r))},enqueueForceUpdate:function(e,t){e=e._reactInternals;var n=Ad(),r=ho(n);r.tag=2,t!=null&&(r.callback=t),t=go(e,r,n),t!==null&&(Nd(t,e,n),_o(t,e,n))}};function vc(e,t,n,r,i,a,o){return e=e.stateNode,typeof e.shouldComponentUpdate==`function`?e.shouldComponentUpdate(r,a,o):t.prototype&&t.prototype.isPureReactComponent?!Vr(n,r)||!Vr(i,a):!0}function yc(e,t,n,r){e=t.state,typeof t.componentWillReceiveProps==`function`&&t.componentWillReceiveProps(n,r),typeof t.UNSAFE_componentWillReceiveProps==`function`&&t.UNSAFE_componentWillReceiveProps(n,r),t.state!==e&&_c.enqueueReplaceState(t,t.state,null)}function bc(e,t){var n=t;if(`ref`in t)for(var r in n={},t)r!==`ref`&&(n[r]=t[r]);if(e=e.defaultProps)for(var i in n===t&&(n=D({},n)),e)n[i]===void 0&&(n[i]=e[i]);return n}function xc(e){yi(e)}function Sc(e){console.error(e)}function Cc(e){yi(e)}function wc(e,t){try{var n=e.onUncaughtError;n(t.value,{componentStack:t.stack})}catch(e){setTimeout(function(){throw e})}}function Tc(e,t,n){try{var r=e.onCaughtError;r(n.value,{componentStack:n.stack,errorBoundary:t.tag===1?t.stateNode:null})}catch(e){setTimeout(function(){throw e})}}function Ec(e,t,n){return n=ho(n),n.tag=3,n.payload={element:null},n.callback=function(){wc(e,t)},n}function Dc(e){return e=ho(e),e.tag=3,e}function Oc(e,t,n,r){var i=n.type.getDerivedStateFromError;if(typeof i==`function`){var a=r.value;e.payload=function(){return i(a)},e.callback=function(){Tc(t,n,r)}}var o=n.stateNode;o!==null&&typeof o.componentDidCatch==`function`&&(e.callback=function(){Tc(t,n,r),typeof i!=`function`&&(_d===null?_d=new Set([this]):_d.add(this));var e=r.stack;this.componentDidCatch(r.value,{componentStack:e===null?``:e})})}function kc(e,t,n,r,a){if(n.flags|=32768,typeof r==`object`&&r&&typeof r.then==`function`){if(t=n.alternate,t!==null&&xa(t,n,a,!0),n=ko.current,n!==null){switch(n.tag){case 31:case 13:case 19:return Ao===null?Gd():n.alternate===null&&id===0&&(id=3),n.flags&=-257,n.flags|=65536,n.lanes=a,r===Za?n.flags|=16384:(t=n.updateQueue,t===null?n.updateQueue=new Set([r]):t.add(r),mf(e,r,a)),!1;case 22:return n.flags|=65536,r===Za?n.flags|=16384:(t=n.updateQueue,t===null?(t={transitions:null,markerInstances:null,retryQueue:new Set([r])},n.updateQueue=t):(n=t.retryQueue,n===null?t.retryQueue=new Set([r]):n.add(r)),mf(e,r,a)),!1}throw Error(i(435,n.tag))}return mf(e,r,a),Gd(),!1}if(V)return t=ko.current,t===null?(r!==oa&&(t=Error(i(423),{cause:r}),pa(Vi(t,n))),e=e.current.alternate,e.flags|=65536,a&=-a,e.lanes|=a,r=Vi(r,n),a=Ec(e.stateNode,r,a),vo(e,a),id!==4&&(id=2)):(!(t.flags&65536)&&(t.flags|=256),t.flags|=65536,t.lanes=a,r!==oa&&(e=Error(i(422),{cause:r}),pa(Vi(e,n)))),!1;var o=Error(i(520),{cause:r});if(o=Vi(o,n),ud===null?ud=[o]:ud.push(o),id!==4&&(id=2),t===null)return!0;r=Vi(r,n),n=t;do{switch(n.tag){case 3:return n.flags|=65536,e=a&-a,n.lanes|=e,e=Ec(n.stateNode,r,e),vo(n,e),!1;case 1:if(t=n.type,o=n.stateNode,!(n.flags&128)&&(typeof t.getDerivedStateFromError==`function`||o!==null&&typeof o.componentDidCatch==`function`&&(_d===null||!_d.has(o))))return n.flags|=65536,a&=-a,n.lanes|=a,a=Dc(a),Oc(a,e,n,r),vo(n,a),!1;break;case 22:if(n.memoizedState!==null)return n.flags|=65536,!1}n=n.return}while(n!==null);return!1}var Ac=Error(i(461)),jc=!1;function Mc(e,t,n,r){t.child=e===null?fo(t,null,n,r):uo(t,e.child,n,r)}function Nc(e,t,n,r,i){n=n.render;var a=t.ref;if(`ref`in r){var o={};for(var s in r)s!==`ref`&&(o[s]=r[s])}else o=r;return Ca(t),r=Xo(e,t,n,o,a,i),s=es(),e!==null&&!jc?(ts(e,t,i),ol(e,t,i)):(V&&s&&$i(t),t.flags|=1,Mc(e,t,r,i),t.child)}function Pc(e,t,n,r,i){if(e===null){var a=n.type;return typeof a==`function`&&!Mi(a)&&a.defaultProps===void 0&&n.compare===null?(t.tag=15,t.type=a,Fc(e,t,a,r,i)):(e=Fi(n.type,null,r,t,t.mode,i),e.ref=t.ref,e.return=t,t.child=e)}if(a=e.child,!sl(e,i)){var o=a.memoizedProps;if(n=n.compare,n=n===null?Vr:n,n(o,r)&&e.ref===t.ref)return ol(e,t,i)}return t.flags|=1,e=Ni(a,r),e.ref=t.ref,e.return=t,t.child=e}function Fc(e,t,n,r,i){if(e!==null){var a=e.memoizedProps;if(Vr(a,r)&&e.ref===t.ref){if(jc=!1,t.pendingProps=r=a,sl(e,i))e.flags&131072&&(jc=!0);else return t.lanes=e.lanes,ol(e,t,i)}}return Uc(e,t,n,r,i)}function Ic(e,t,n,r){var i=r.children,a=e===null?null:e.memoizedState;if(e===null&&t.stateNode===null&&(t.stateNode={_visibility:1,_pendingMarkers:null,_retryCache:null,_transitions:null}),r.mode===`hidden`){if(t.flags&128){if(a=a===null?n:a.baseLanes|n,e!==null){for(r=t.child=e.child,i=0;r!==null;)i=i|r.lanes|r.childLanes,r=r.sibling;r=i&~a}else r=0,t.child=null;return Rc(e,t,a,n,r)}if(n&536870912)t.memoizedState={baseLanes:0,cachePool:null},e!==null&&Ka(t,a===null?null:a.cachePool),a===null?Do():Eo(t,a),No(t);else return r=t.lanes=536870912,Rc(e,t,a===null?n:a.baseLanes|n,n,r)}else a===null?(e!==null&&Ka(t,null),Do(),Po()):(Ka(t,a.cachePool),Eo(t,a),Po(),t.memoizedState=null);return Mc(e,t,i,n),t.child}function Lc(e,t){return e!==null&&e.tag===22||t.stateNode!==null||(t.stateNode={_visibility:1,_pendingMarkers:null,_retryCache:null,_transitions:null}),t.sibling}function Rc(e,t,n,r,i){var a=Ga();return a=a===null?null:{parent:Aa._currentValue,pool:a},t.memoizedState={baseLanes:n,cachePool:a},e!==null&&Ka(t,null),Do(),No(t),e!==null&&xa(e,t,r,!0),t.childLanes=i,null}function zc(e,t){return t=Qc({mode:t.mode,children:t.children},e.mode),t.ref=e.ref,e.child=t,t.return=e,t}function Bc(e,t,n){return uo(t,e.child,null,n),e=zc(t,t.pendingProps),e.flags|=2,Fo(t),t.memoizedState=null,e}function Vc(e,t,n){var r=t.pendingProps,a=!!(t.flags&128);if(t.flags&=-129,e===null){if(V){if(r.mode===`hidden`)return e=zc(t,r),t.lanes=536870912,e.memoizedState={baseLanes:0,cachePool:null},Lc(null,e);if(Mo(t),(e=ra)?(e=am(e,aa),e=e!==null&&e.data===`&`?e:null,e!==null&&(t.memoizedState={dehydrated:e,treeContext:Ji===null?null:{id:Yi,overflow:Xi},retryLane:536870912,hydrationErrors:null},n=Ri(e),n.return=t,t.child=n,na=t,ra=null)):e=null,e===null)throw sa(t);return t.lanes=536870912,null}return zc(t,r)}var o=e.memoizedState;if(o!==null){var s=o.dehydrated;if(Mo(t),a){if(t.flags&256)t.flags&=-257,t=Bc(e,t,n);else if(t.memoizedState!==null)t.child=e.child,t.flags|=128,t=null;else throw Error(i(558))}else if(jc||xa(e,t,n,!1),a=(n&e.childLanes)!==0,jc||a){if(wo.current===null){if(r=Qu,r!==null&&(s=ht(r,n),s!==0&&s!==o.retryLane))throw o.retryLane=s,Ei(e,s),Nd(r,e,s),Ac;Gd()}t=Bc(e,t,n)}else e=o.treeContext,ra=lm(s.nextSibling),na=t,V=!0,ia=null,aa=!1,e!==null&&ta(t,e),t=zc(t,r),t.flags|=134221824;return t}return e=Ni(e.child,{mode:r.mode,children:r.children}),e.ref=t.ref,t.child=e,e.return=t,e}function Hc(e,t){var n=t.ref;if(n===null)e!==null&&e.ref!==null&&(t.flags|=4194816);else{if(typeof n!=`function`&&typeof n!=`object`)throw Error(i(284));(e===null||e.ref!==n)&&(t.flags|=4194816)}}function Uc(e,t,n,r,i){return Ca(t),n=Xo(e,t,n,r,void 0,i),r=es(),e!==null&&!jc?(ts(e,t,i),ol(e,t,i)):(V&&r&&$i(t),t.flags|=1,Mc(e,t,n,i),t.child)}function Wc(e,t,n,r,i,a){return Ca(t),t.updateQueue=null,n=Qo(t,r,n,i),Zo(e),r=es(),e!==null&&!jc?(ts(e,t,a),ol(e,t,a)):(V&&r&&$i(t),t.flags|=1,Mc(e,t,n,a),t.child)}function Gc(e,t,n,r,i){if(Ca(t),t.stateNode===null){var a=ki,o=n.contextType;typeof o==`object`&&o&&(a=wa(o)),a=new n(r,a),t.memoizedState=a.state!==null&&a.state!==void 0?a.state:null,a.updater=_c,t.stateNode=a,a._reactInternals=t,a=t.stateNode,a.props=r,a.state=t.memoizedState,a.refs={},po(t),o=n.contextType,a.context=typeof o==`object`&&o?wa(o):ki,a.state=t.memoizedState,o=n.getDerivedStateFromProps,typeof o==`function`&&(gc(t,n,o,r),a.state=t.memoizedState),typeof n.getDerivedStateFromProps==`function`||typeof a.getSnapshotBeforeUpdate==`function`||typeof a.UNSAFE_componentWillMount!=`function`&&typeof a.componentWillMount!=`function`||(o=a.state,typeof a.componentWillMount==`function`&&a.componentWillMount(),typeof a.UNSAFE_componentWillMount==`function`&&a.UNSAFE_componentWillMount(),o!==a.state&&_c.enqueueReplaceState(a,a.state,null),xo(t,r,a,i),bo(),a.state=t.memoizedState),typeof a.componentDidMount==`function`&&(t.flags|=4194308),r=!0}else if(e===null){a=t.stateNode;var s=t.memoizedProps,c=bc(n,s);a.props=c;var l=a.context,u=n.contextType;o=ki,typeof u==`object`&&u&&(o=wa(u));var d=n.getDerivedStateFromProps;u=typeof d==`function`||typeof a.getSnapshotBeforeUpdate==`function`,s=t.pendingProps!==s,u||typeof a.UNSAFE_componentWillReceiveProps!=`function`&&typeof a.componentWillReceiveProps!=`function`||(s||l!==o)&&yc(t,a,r,o),H=!1;var f=t.memoizedState;a.state=f,xo(t,r,a,i),bo(),l=t.memoizedState,s||f!==l||H?(typeof d==`function`&&(gc(t,n,d,r),l=t.memoizedState),(c=H||vc(t,n,c,r,f,l,o))?(u||typeof a.UNSAFE_componentWillMount!=`function`&&typeof a.componentWillMount!=`function`||(typeof a.componentWillMount==`function`&&a.componentWillMount(),typeof a.UNSAFE_componentWillMount==`function`&&a.UNSAFE_componentWillMount()),typeof a.componentDidMount==`function`&&(t.flags|=4194308)):(typeof a.componentDidMount==`function`&&(t.flags|=4194308),t.memoizedProps=r,t.memoizedState=l),a.props=r,a.state=l,a.context=o,r=c):(typeof a.componentDidMount==`function`&&(t.flags|=4194308),r=!1)}else{a=t.stateNode,mo(e,t),o=t.memoizedProps,u=bc(n,o),a.props=u,d=t.pendingProps,f=a.context,l=n.contextType,c=ki,typeof l==`object`&&l&&(c=wa(l)),s=n.getDerivedStateFromProps,(l=typeof s==`function`||typeof a.getSnapshotBeforeUpdate==`function`)||typeof a.UNSAFE_componentWillReceiveProps!=`function`&&typeof a.componentWillReceiveProps!=`function`||(o!==d||f!==c)&&yc(t,a,r,c),H=!1,f=t.memoizedState,a.state=f,xo(t,r,a,i),bo();var p=t.memoizedState;o!==d||f!==p||H||e!==null&&e.dependencies!==null&&Sa(e.dependencies)?(typeof s==`function`&&(gc(t,n,s,r),p=t.memoizedState),(u=H||vc(t,n,u,r,f,p,c)||e!==null&&e.dependencies!==null&&Sa(e.dependencies))?(l||typeof a.UNSAFE_componentWillUpdate!=`function`&&typeof a.componentWillUpdate!=`function`||(typeof a.componentWillUpdate==`function`&&a.componentWillUpdate(r,p,c),typeof a.UNSAFE_componentWillUpdate==`function`&&a.UNSAFE_componentWillUpdate(r,p,c)),typeof a.componentDidUpdate==`function`&&(t.flags|=4),typeof a.getSnapshotBeforeUpdate==`function`&&(t.flags|=1024)):(typeof a.componentDidUpdate!=`function`||o===e.memoizedProps&&f===e.memoizedState||(t.flags|=4),typeof a.getSnapshotBeforeUpdate!=`function`||o===e.memoizedProps&&f===e.memoizedState||(t.flags|=1024),t.memoizedProps=r,t.memoizedState=p),a.props=r,a.state=p,a.context=c,r=u):(typeof a.componentDidUpdate!=`function`||o===e.memoizedProps&&f===e.memoizedState||(t.flags|=4),typeof a.getSnapshotBeforeUpdate!=`function`||o===e.memoizedProps&&f===e.memoizedState||(t.flags|=1024),r=!1)}return a=r,Hc(e,t),r=!!(t.flags&128),a||r?(a=t.stateNode,n=r&&typeof n.getDerivedStateFromError!=`function`?null:a.render(),t.flags|=1,e!==null&&r?(t.child=uo(t,e.child,null,i),t.child=uo(t,null,n,i)):Mc(e,t,n,i),t.memoizedState=a.state,e=t.child):e=ol(e,t,i),e}function Kc(e,t,n,r){return da(),t.flags|=256,Mc(e,t,n,r),t.child}var qc={dehydrated:null,treeContext:null,retryLane:0,hydrationErrors:null};function Jc(e){return{baseLanes:e,cachePool:qa()}}function Yc(e,t,n){return e=e===null?0:e.childLanes&~n,t&&(e|=cd),e}function Xc(e,t,n){var r=t.pendingProps,i=!1,a=!!(t.flags&128),o;if((o=a)||(o=e!==null&&e.memoizedState===null?!1:!!(Io.current&2)),o&&(i=!0,t.flags&=-129),o=!!(t.flags&32),t.flags&=-33,e===null){if(V){if(i?jo(t):Po(),(e=ra)?(e=am(e,aa),e=e!==null&&e.data!==`&`?e:null,e!==null&&(t.memoizedState={dehydrated:e,treeContext:Ji===null?null:{id:Yi,overflow:Xi},retryLane:536870912,hydrationErrors:null},n=Ri(e),n.return=t,t.child=n,na=t,ra=null)):e=null,e===null)throw sa(t);return t.lanes=sm(e)?32:536870912,null}return a=r.children,r=r.fallback,i?(Po(),i=t.mode,a=Qc({mode:`hidden`,children:a},i),r=Ii(r,i,n,null),a.return=t,r.return=t,a.sibling=r,t.child=a,r=t.child,r.memoizedState=Jc(n),r.childLanes=Yc(e,o,n),t.memoizedState=qc,Lc(null,r)):(jo(t),Zc(t,a))}var s=e.memoizedState;if(s!==null){var c=s.dehydrated;if(c!==null)return el(e,t,a,o,r,c,s,n)}return i?(Po(),i=r.fallback,a=t.mode,s=e.child,c=s.sibling,r=Ni(s,{mode:`hidden`,children:r.children}),r.subtreeFlags=s.subtreeFlags&1206910976,c===null?(i=Ii(i,a,n,null),i.flags|=2):i=Ni(c,i),i.return=t,r.return=t,r.sibling=i,t.child=r,Lc(null,r),r=t.child,i=e.child.memoizedState,i===null?i=Jc(n):(a=i.cachePool,a===null?a=qa():(s=Aa._currentValue,a=a.parent===s?a:{parent:s,pool:s}),i={baseLanes:i.baseLanes|n,cachePool:a}),r.memoizedState=i,r.childLanes=Yc(e,o,n),t.memoizedState=qc,Lc(e.child,r)):(jo(t),n=e.child,e=n.sibling,n=Ni(n,{mode:`visible`,children:r.children}),n.return=t,n.sibling=null,e!==null&&(o=t.deletions,o===null?(t.deletions=[e],t.flags|=16):o.push(e)),t.child=n,t.memoizedState=null,n)}function Zc(e,t){return t=Qc({mode:`visible`,children:t},e.mode),t.return=e,e.child=t}function Qc(e,t){return e=ji(22,e,null,t),e.lanes=0,e}function $c(e,t,n){return uo(t,e.child,null,n),e=Zc(t,t.pendingProps.children),e.flags|=2,t.memoizedState=null,e}function el(e,t,n,r,a,o,s,c){if(n)return t.flags&256?(jo(t),t.flags&=-257,$c(e,t,c)):t.memoizedState===null?(Po(),o=a.fallback,s=t.mode,a=Qc({mode:`visible`,children:a.children},s),o=Ii(o,s,c,null),o.flags|=2,a.return=t,o.return=t,a.sibling=o,t.child=a,uo(t,e.child,null,c),a=t.child,a.memoizedState=Jc(c),a.childLanes=Yc(e,r,c),t.memoizedState=qc,Lc(null,a)):(Po(),t.child=e.child,t.flags|=128,null);if(jo(t),sm(o)){if(r=o.nextSibling&&o.nextSibling.dataset,r)var l=r.dgst;return r=l,r!==``&&(a=Error(i(419)),a.stack=``,a.digest=r,pa({value:a,source:null,stack:null})),$c(e,t,c)}if(jc||xa(e,t,c,!1),r=(c&e.childLanes)!==0,jc||r){if(wo.current!==null)return $c(e,t,c);if(r=Qu,r!==null&&(a=ht(r,c),a!==0&&a!==s.retryLane))throw s.retryLane=a,Ei(e,a),Nd(r,e,a),Ac;return om(o)||Gd(),$c(e,t,c)}return om(o)?(t.flags|=192,t.child=e.child,null):(e=s.treeContext,ra=lm(o.nextSibling),na=t,V=!0,ia=null,aa=!1,e!==null&&ta(t,e),t=Zc(t,a.children),t.flags|=134221824,t)}function tl(e,t,n){e.lanes|=t;var r=e.alternate;r!==null&&(r.lanes|=t),ya(e.return,t,n)}function K(e){for(var t=null;e!==null;){var n=e.alternate;n!==null&&zo(n)===null&&(t=e),e=e.sibling}return t}function nl(e,t,n,r,i,a){var o=e.memoizedState;o===null?e.memoizedState={isBackwards:t,rendering:null,renderingStartTime:0,last:r,tail:n,tailMode:i,treeForkCount:a}:(o.isBackwards=t,o.rendering=null,o.renderingStartTime=0,o.last=r,o.tail=n,o.tailMode=i,o.treeForkCount=a)}function rl(e){var t=e.child;for(e.child=null;t!==null;){var n=t.sibling;t.sibling=e.child,e.child=t,t=n}}function il(e,t,n){var r=t.pendingProps,i=r.revealOrder,a=r.tail;r=r.children;var o=Io.current;if(t.flags&128)return Lo(t,o),null;var s=!!(o&2);if(s?(o=o&1|2,t.flags|=128):o&=1,Lo(t,o),i===`backwards`&&e!==null?(rl(e),Mc(e,t,r,n),rl(e)):Mc(e,t,r,n),r=V?Gi:0,!s&&e!==null&&e.flags&128)a:for(e=t.child;e!==null;){if(e.tag===13)e.memoizedState!==null&&tl(e,n,t);else if(e.tag===19)tl(e,n,t);else if(e.child!==null){e.child.return=e,e=e.child;continue}if(e===t)break a;for(;e.sibling===null;){if(e.return===null||e.return===t)break a;e=e.return}e.sibling.return=e.return,e=e.sibling}switch(i){case`backwards`:n=K(t.child),n===null?(i=t.child,t.child=null):(i=n.sibling,n.sibling=null,rl(t)),nl(t,!0,i,null,a,r);break;case`unstable_legacy-backwards`:for(n=null,i=t.child,t.child=null;i!==null;){if(e=i.alternate,e!==null&&zo(e)===null){t.child=i;break}e=i.sibling,i.sibling=n,n=i,i=e}nl(t,!0,n,null,a,r);break;case`together`:nl(t,!1,null,null,void 0,r);break;case`independent`:t.memoizedState=null;break;default:n=K(t.child),n===null?(i=t.child,t.child=null):(i=n.sibling,n.sibling=null),nl(t,!1,i,n,a,r)}return t.child}function al(e,t,n){var r=t.pendingProps;return _a(t,t.type,r.value),Mc(e,t,r.children,n),t.child}function ol(e,t,n){if(e!==null&&(t.dependencies=e.dependencies),ad|=t.lanes,(n&t.childLanes)===0){if(e!==null){if(xa(e,t,n,!1),(n&t.childLanes)===0)return null}else return null}if(e!==null&&t.child!==e.child)throw Error(i(153));if(t.child!==null){for(e=t.child,n=Ni(e,e.pendingProps),t.child=n,n.return=t;e.sibling!==null;)e=e.sibling,n=n.sibling=Ni(e,e.pendingProps),n.return=t;n.sibling=null}return t.child}function sl(e,t){return(e.lanes&t)!==0||(e=e.dependencies,!!(e!==null&&Sa(e)))}function cl(e,t,n){switch(t.tag){case 3:Ce(t,t.stateNode.containerInfo),_a(t,Aa,e.memoizedState.cache),da();break;case 27:case 5:Te(t);break;case 4:Ce(t,t.stateNode.containerInfo);break;case 10:_a(t,t.type,t.memoizedProps.value);break;case 31:if(t.memoizedState!==null)return t.flags|=128,Mo(t),null;break;case 13:var r=t.memoizedState;if(r!==null){if(r.dehydrated!==null)return jo(t),t.flags|=128,null;r=xa(e,t,n,!1);var i=t.child.childLanes;return r||(n&i)!==0?Xc(e,t,n):(jo(t),e=ol(e,t,n),e===null?null:e.sibling)}jo(t);break;case 19:if(t.flags&128)return il(e,t,n);if(i=!!(e.flags&128),r=(n&t.childLanes)!==0,r||=(xa(e,t,n,!1),(n&t.childLanes)!==0),i){if(r)return il(e,t,n);t.flags|=128}if(i=t.memoizedState,i!==null&&(i.rendering=null,i.tail=null,i.lastEffect=null),Lo(t,Io.current),r)break;return null;case 22:return t.lanes=0,Ic(e,t,n,t.pendingProps);case 24:_a(t,Aa,e.memoizedState.cache)}return ol(e,t,n)}function ll(e,t,n){if(e!==null){if(e.memoizedProps!==t.pendingProps)jc=!0;else{if(!sl(e,n)&&!(t.flags&128))return jc=!1,cl(e,t,n);jc=!!(e.flags&131072)}}else jc=!1,V&&t.flags&1048576&&Qi(t,Gi,t.index);switch(t.lanes=0,t.tag){case 16:a:{var r=t.pendingProps;if(e=eo(t.elementType),t.type=e,typeof e==`function`)Mi(e)?(r=bc(e,r),t.tag=1,t=Gc(null,t,e,r,n)):(t.tag=0,t=Uc(null,t,e,r,n));else{if(e!=null){var a=e.$$typeof;if(a===ne){t.tag=11,t=Nc(null,t,e,r,n);break a}if(a===P){t.tag=14,t=Pc(null,t,e,r,n);break a}if(a===N){t.tag=10,t.type=e,t=al(null,t,n);break a}}throw t=me(e)||e,Error(i(306,t,``))}}return t;case 0:return Uc(e,t,t.type,t.pendingProps,n);case 1:return r=t.type,a=bc(r,t.pendingProps),Gc(e,t,r,a,n);case 3:a:{if(Ce(t,t.stateNode.containerInfo),e===null)throw Error(i(387));r=t.pendingProps;var o=t.memoizedState;a=o.element,mo(e,t),xo(t,r,null,n);var s=t.memoizedState;if(r=s.cache,_a(t,Aa,r),r!==o.cache&&ba(t,[Aa],n,!0),bo(),r=s.element,o.isDehydrated){if(o={element:r,isDehydrated:!1,cache:s.cache},t.updateQueue.baseState=o,t.memoizedState=o,t.flags&256){t=Kc(e,t,r,n);break a}if(r!==a){a=Vi(Error(i(424)),t),pa(a),t=Kc(e,t,r,n);break a}switch(e=t.stateNode.containerInfo,e.nodeType){case 9:e=e.body;break;default:e=e.nodeName===`HTML`?e.ownerDocument.body:e}for(ra=lm(e.firstChild),na=t,V=!0,ia=null,aa=!0,n=fo(t,null,r,n),t.child=n;n;)n.flags=n.flags&-3|134221824,n=n.sibling}else{if(da(),r===a){t=ol(e,t,n);break a}Mc(e,t,r,n)}t=t.child}return t;case 26:return Hc(e,t),e===null?(n=Nm(t.type,null,t.pendingProps,null))?t.memoizedState=n:V||(t.stateNode=fp(t.type,t.pendingProps,xe.current,t)):t.memoizedState=Nm(t.type,e.memoizedProps,t.pendingProps,e.memoizedState),null;case 27:return Te(t),e===null&&V&&(r=t.stateNode=hm(t.type,t.pendingProps,xe.current),na=t,aa=!0,a=ra,Sp(t.type)?(um=a,ra=lm(r.firstChild)):ra=a),Mc(e,t,t.pendingProps.children,n),Hc(e,t),e===null&&(t.flags|=4194304),t.child;case 5:return e===null&&V&&((a=r=ra)&&(r=rm(r,t.type,t.pendingProps,aa),r===null?a=!1:(t.stateNode=r,na=t,ra=lm(r.firstChild),aa=!1,a=!0)),a||sa(t)),Te(t),a=t.type,o=t.pendingProps,s=e===null?null:e.memoizedProps,r=o.children,pp(a,o)?r=null:s!==null&&pp(a,s)&&(t.flags|=32),t.memoizedState!==null&&(a=Xo(e,t,$o,null,null,n),sh._currentValue=a),Hc(e,t),Mc(e,t,r,n),t.child;case 6:return e===null&&V&&((e=n=ra)&&(n=im(n,t.pendingProps,aa),n===null?e=!1:(t.stateNode=n,na=t,ra=null,e=!0)),e||sa(t)),null;case 13:return Xc(e,t,n);case 4:return Ce(t,t.stateNode.containerInfo),r=t.pendingProps,e===null?t.child=uo(t,null,r,n):Mc(e,t,r,n),t.child;case 11:return Nc(e,t,t.type,t.pendingProps,n);case 7:return r=t.pendingProps,Hc(e,t),Mc(e,t,r,n),t.child;case 8:return Mc(e,t,t.pendingProps.children,n),t.child;case 12:return Mc(e,t,t.pendingProps.children,n),t.child;case 10:return al(e,t,n);case 9:return a=t.type._context,r=t.pendingProps.children,Ca(t),a=wa(a),r=r(a),t.flags|=1,Mc(e,t,r,n),t.child;case 14:return Pc(e,t,t.type,t.pendingProps,n);case 15:return Fc(e,t,t.type,t.pendingProps,n);case 19:return il(e,t,n);case 31:return Vc(e,t,n);case 22:return Ic(e,t,n,t.pendingProps);case 24:return Ca(t),r=wa(Aa),e===null?(a=Ga(),a===null&&(a=Qu,o=ja(),a.pooledCache=o,o.refCount++,o!==null&&(a.pooledCacheLanes|=n),a=o),t.memoizedState={parent:r,cache:a},po(t),_a(t,Aa,a)):((e.lanes&n)!==0&&(mo(e,t),xo(t,null,null,n),bo()),a=e.memoizedState,o=t.memoizedState,a.parent===r?(r=o.cache,_a(t,Aa,r),r!==a.cache&&ba(t,[Aa],n,!0)):(a={parent:r,cache:r},t.memoizedState=a,t.lanes===0&&(t.memoizedState=t.updateQueue.baseState=a),_a(t,Aa,r))),Mc(e,t,t.pendingProps.children,n),t.child;case 30:return t.stateNode===null&&(t.stateNode={autoName:null,paired:null,clones:null,ref:null}),r=t.pendingProps,r.name!=null&&r.name!==`auto`?t.flags|=e===null?18882560:18874368:V&&$i(t),e!==null&&e.memoizedProps.name!==r.name?t.flags|=4194816:Hc(e,t),Mc(e,t,r.children,n),t.child;case 29:throw t.pendingProps}throw Error(i(156,t.tag))}function ul(e){e.flags|=4}function dl(e,t,n,r,i){var a;if((a=!!(e.mode&32))&&(a=n===null?Jm(t,r):Jm(t,r)&&(r.src!==n.src||r.srcSet!==n.srcSet)),a){if(e.flags|=16777216,(i&335544128)===i){if(e.stateNode.complete)e.flags|=8192;else if(Hd())e.flags|=8192;else throw to=Za,Ya}}else e.flags&=-16777217}function fl(e,t){if(t.type!==`stylesheet`||t.state.loading&4)e.flags&=-16777217;else if(e.flags|=16777216,!Ym(t)){if(Hd())e.flags|=8192;else throw to=Za,Ya}}function pl(e,t){t!==null&&(e.flags|=4),e.flags&16384&&(t=e.tag===22?536870912:lt(),e.lanes|=t,ld|=t)}function ml(e,t){if(!V)switch(e.tailMode){case`visible`:break;case`collapsed`:for(var n=e.tail,r=null;n!==null;)n.alternate!==null&&(r=n),n=n.sibling;r===null?t||e.tail===null?e.tail=null:e.tail.sibling=null:r.sibling=null;break;default:for(t=e.tail,n=null;t!==null;)t.alternate!==null&&(n=t),t=t.sibling;n===null?e.tail=null:n.sibling=null}}function hl(e){var t=e.alternate!==null&&e.alternate.child===e.child,n=0,r=0;if(t)for(var i=e.child;i!==null;)n|=i.lanes|i.childLanes,r|=i.subtreeFlags&1206910976,r|=i.flags&1206910976,i.return=e,i=i.sibling;else for(i=e.child;i!==null;)n|=i.lanes|i.childLanes,r|=i.subtreeFlags,r|=i.flags,i.return=e,i=i.sibling;return e.subtreeFlags|=r,e.childLanes=n,t}function gl(e,t,n){var r=t.pendingProps;switch(ea(t),t.tag){case 16:case 15:case 0:case 11:case 7:case 8:case 12:case 9:case 14:return hl(t),null;case 1:return hl(t),null;case 3:return n=t.stateNode,r=null,e!==null&&(r=e.memoizedState.cache),t.memoizedState.cache!==r&&(t.flags|=2048),va(Aa),we(),n.pendingContext&&(n.context=n.pendingContext,n.pendingContext=null),(e===null||e.child===null)&&(ua(t)?ul(t):e===null||e.memoizedState.isDehydrated&&!(t.flags&256)||(t.flags|=1024,fa())),hl(t),null;case 26:var a=t.type,o=t.memoizedState;return e===null?(ul(t),o===null?(hl(t),dl(t,a,null,r,n)):(hl(t),fl(t,o))):o?o===e.memoizedState?(hl(t),t.flags&=-16777217):(ul(t),hl(t),fl(t,o)):(e=e.memoizedProps,e!==r&&ul(t),hl(t),dl(t,a,e,r,n)),null;case 27:if(Ee(t),n=xe.current,a=t.type,e!==null&&t.stateNode!=null)e.memoizedProps!==r&&ul(t);else{if(!r){if(t.stateNode===null)throw Error(i(166));return hl(t),t.subtreeFlags&=-33554433,null}e=be.current,ua(t)?ca(t,e):(e=hm(a,r,n),t.stateNode=e,ul(t))}return hl(t),t.subtreeFlags&=-33554433,null;case 5:if(Ee(t),a=t.type,e!==null&&t.stateNode!=null)e.memoizedProps!==r&&ul(t);else{if(!r){if(t.stateNode===null)throw Error(i(166));return hl(t),t.subtreeFlags&=-33554433,null}if(o=be.current,ua(t))ca(t,o);else{var s=lp(xe.current);switch(o){case 1:o=s.createElementNS(`http://www.w3.org/2000/svg`,a);break;case 2:o=s.createElementNS(`http://www.w3.org/1998/Math/MathML`,a);break;default:switch(a){case`svg`:o=s.createElementNS(`http://www.w3.org/2000/svg`,a);break;case`math`:o=s.createElementNS(`http://www.w3.org/1998/Math/MathML`,a);break;case`script`:o=s.createElement(`div`),o.innerHTML=`<script><\\/script>`,o=o.removeChild(o.firstChild);break;case`select`:o=typeof r.is==`string`?s.createElement(`select`,{is:r.is}):s.createElement(`select`),r.multiple?o.multiple=!0:r.size&&(o.size=r.size);break;default:o=typeof r.is==`string`?s.createElement(a,{is:r.is}):s.createElement(a)}}o[xt]=t,o[St]=r;a:for(s=t.child;s!==null;){if(s.tag===5||s.tag===6)o.appendChild(s.stateNode);else if(s.tag!==4&&s.tag!==27&&s.child!==null){s.child.return=s,s=s.child;continue}if(s===t)break a;for(;s.sibling===null;){if(s.return===null||s.return===t)break a;s=s.return}s.sibling.return=s.return,s=s.sibling}t.stateNode=o;a:switch(np(o,a,r),a){case`button`:case`input`:case`select`:case`textarea`:r=!!r.autoFocus;break a;case`img`:r=!0;break a;default:r=!1}r&&ul(t)}}return hl(t),t.subtreeFlags&=-33554433,dl(t,t.type,e===null?null:e.memoizedProps,t.pendingProps,n),null;case 6:if(e&&t.stateNode!=null)e.memoizedProps!==r&&ul(t);else{if(typeof r!=`string`&&t.stateNode===null)throw Error(i(166));if(e=xe.current,ua(t)){if(e=t.stateNode,n=t.memoizedProps,r=null,a=na,a!==null)switch(a.tag){case 27:case 5:r=a.memoizedProps}e[xt]=t,e=!!(e.nodeValue===n||r!==null&&!0===r.suppressHydrationWarning||ep(e.nodeValue,n)),e||sa(t,!0)}else e=lp(e).createTextNode(r),e[xt]=t,t.stateNode=e}return hl(t),null;case 31:if(n=t.memoizedState,e===null||e.memoizedState!==null){if(r=ua(t),n!==null){if(e===null){if(!r)throw Error(i(318));if(e=t.memoizedState,e=e===null?null:e.dehydrated,!e)throw Error(i(557));e[xt]=t}else da(),!(t.flags&128)&&(t.memoizedState=null),t.flags|=4;hl(t),e=!1}else n=fa(),e!==null&&e.memoizedState!==null&&(e.memoizedState.hydrationErrors=n),e=!0;if(!e)return t.flags&256?(Fo(t),t):(Fo(t),null);if(t.flags&128)throw Error(i(558))}return hl(t),null;case 13:if(r=t.memoizedState,e===null||e.memoizedState!==null&&e.memoizedState.dehydrated!==null){if(a=ua(t),r!==null&&r.dehydrated!==null){if(e===null){if(!a)throw Error(i(318));if(a=t.memoizedState,a=a===null?null:a.dehydrated,!a)throw Error(i(317));a[xt]=t}else da(),!(t.flags&128)&&(t.memoizedState=null),t.flags|=4;hl(t),a=!1}else a=fa(),e!==null&&e.memoizedState!==null&&(e.memoizedState.hydrationErrors=a),a=!0;if(!a)return t.flags&256?(Fo(t),t):(Fo(t),null)}return Fo(t),t.flags&128?(t.lanes=n,t):(n=r!==null,e=e!==null&&e.memoizedState!==null,n&&(r=t.child,a=null,r.alternate!==null&&r.alternate.memoizedState!==null&&r.alternate.memoizedState.cachePool!==null&&(a=r.alternate.memoizedState.cachePool.pool),o=null,r.memoizedState!==null&&r.memoizedState.cachePool!==null&&(o=r.memoizedState.cachePool.pool),o!==a&&(r.flags|=2048)),n!==e&&n&&(t.child.flags|=8192),pl(t,t.updateQueue),hl(t),null);case 4:return we(),e===null&&Wf(t.stateNode.containerInfo),t.flags|=67108864,hl(t),null;case 10:return va(t.type),hl(t),null;case 19:if(Ro(t),r=t.memoizedState,r===null)return hl(t),null;if(a=!!(t.flags&128),o=r.rendering,o===null){if(a)ml(r,!1);else{if(id!==0||e!==null&&e.flags&128)for(e=t.child;e!==null;){if(o=zo(e),o!==null){for(t.flags|=128,ml(r,!1),e=o.updateQueue,t.updateQueue=e,pl(t,e),t.subtreeFlags=0,e=n,n=t.child;n!==null;)Pi(n,e),n=n.sibling;return Lo(t,Io.current&1|2),V&&Zi(t,r.treeForkCount),t.child}e=e.sibling}r.tail!==null&&ze()>hd&&(t.flags|=128,a=!0,ml(r,!1),t.lanes=4194304)}}else{if(!a){if(e=zo(o),e!==null){if(t.flags|=128,a=!0,e=e.updateQueue,t.updateQueue=e,pl(t,e),ml(r,!0),r.tail===null&&r.tailMode!==`collapsed`&&r.tailMode!==`visible`&&!o.alternate&&!V)return hl(t),null}else 2*ze()-r.renderingStartTime>hd&&n!==536870912&&(t.flags|=128,a=!0,ml(r,!1),t.lanes=4194304)}r.isBackwards?(o.sibling=t.child,t.child=o):(e=r.last,e===null?t.child=o:e.sibling=o,r.last=o)}if(r.tail!==null){e=r.tail;a:{for(n=e;n!==null;){if(n.alternate!==null){n=!1;break a}n=n.sibling}n=!0}return r.rendering=e,r.tail=e.sibling,r.renderingStartTime=ze(),e.sibling=null,o=Io.current,o=a?o&1|2:o&1,r.tailMode===`visible`||r.tailMode===`collapsed`||!n||V?Lo(t,o):(n=o,R(ko,t),R(Io,n),Ao===null&&(Ao=t)),V&&Zi(t,r.treeForkCount),e}return hl(t),null;case 22:case 23:return Fo(t),Oo(),r=t.memoizedState!==null,e===null?r&&(t.flags|=8192):e.memoizedState!==null!==r&&(t.flags|=8192),r?n&536870912&&!(t.flags&128)&&(hl(t),t.subtreeFlags&6&&(t.flags|=8192)):hl(t),n=t.updateQueue,n!==null&&pl(t,n.retryQueue),n=null,e!==null&&e.memoizedState!==null&&e.memoizedState.cachePool!==null&&(n=e.memoizedState.cachePool.pool),r=null,t.memoizedState!==null&&t.memoizedState.cachePool!==null&&(r=t.memoizedState.cachePool.pool),r!==n&&(t.flags|=2048),e!==null&&L(Wa),null;case 24:return n=null,e!==null&&(n=e.memoizedState.cache),t.memoizedState.cache!==n&&(t.flags|=2048),va(Aa),hl(t),null;case 25:return null;case 30:return t.flags|=33554432,hl(t),null}throw Error(i(156,t.tag))}function _l(e,t){switch(ea(t),t.tag){case 1:return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 3:return va(Aa),we(),e=t.flags,e&65536&&!(e&128)?(t.flags=e&-65537|128,t):null;case 26:case 27:case 5:return Ee(t),null;case 31:if(t.memoizedState!==null){if(Fo(t),t.alternate===null)throw Error(i(340));da()}return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 13:if(Fo(t),e=t.memoizedState,e!==null&&e.dehydrated!==null){if(t.alternate===null)throw Error(i(340));da()}return e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 19:return Ro(t),e=t.flags,e&65536?(t.flags=e&-65537|128,e=t.memoizedState,e!==null&&(e.rendering=null,e.tail=null),t.flags|=4,t):null;case 4:return we(),null;case 10:return va(t.type),null;case 22:case 23:return Fo(t),Oo(),e!==null&&L(Wa),e=t.flags,e&65536?(t.flags=e&-65537|128,t):null;case 24:return va(Aa),null;case 25:return null;default:return null}}function vl(e,t){switch(ea(t),t.tag){case 3:va(Aa),we();break;case 26:case 27:case 5:Ee(t);break;case 4:we();break;case 31:t.memoizedState!==null&&Fo(t);break;case 13:Fo(t);break;case 19:Ro(t);break;case 10:va(t.type);break;case 22:case 23:Fo(t),Oo(),e!==null&&L(Wa);break;case 24:va(Aa)}}function yl(e,t){try{var n=t.updateQueue,r=n===null?null:n.lastEffect;if(r!==null){var i=r.next;n=i;do{if((n.tag&e)===e){r=void 0;var a=n.create,o=n.inst;r=a(),o.destroy=r}n=n.next}while(n!==i)}}catch(e){pf(t,t.return,e)}}function bl(e,t,n){try{var r=t.updateQueue,i=r===null?null:r.lastEffect;if(i!==null){var a=i.next;r=a;do{if((r.tag&e)===e){var o=r.inst,s=o.destroy;if(s!==void 0){o.destroy=void 0,i=t;var c=n,l=s;try{l()}catch(e){pf(i,c,e)}}}r=r.next}while(r!==a)}}catch(e){pf(t,t.return,e)}}function xl(e){var t=e.updateQueue;if(t!==null){var n=e.stateNode;try{Co(t,n)}catch(t){pf(e,e.return,t)}}}function Sl(e,t,n){n.props=bc(e.type,e.memoizedProps),n.state=e.memoizedState;try{n.componentWillUnmount()}catch(n){pf(e,t,n)}}function Cl(e,t){try{var n=e.ref;if(n!==null){switch(e.tag){case 26:case 27:case 5:var r=e.stateNode;break;case 30:var i=e.stateNode,a=gi(e.memoizedProps,i);(i.ref===null||i.ref.name!==a)&&(i.ref=Pp(a)),r=i.ref;break;case 7:if(e.stateNode===null){var o=new Fp(e);h(e.child,!1,Qp,o,void 0,void 0),e.stateNode=o}r=e.stateNode;break;default:r=e.stateNode}typeof n==`function`?e.refCleanup=n(r):n.current=r}}catch(n){pf(e,t,n)}}function wl(e,t){var n=e.ref,r=e.refCleanup;if(n!==null){if(typeof r==`function`)try{r()}catch(n){pf(e,t,n)}finally{e.refCleanup=null,e=e.alternate,e!=null&&(e.refCleanup=null)}else if(typeof n==`function`)try{n(null)}catch(n){pf(e,t,n)}else n.current=null}}function Tl(e,t){if((e.tag===5||e.tag===27||e.tag===6)&&e.alternate===null&&t!==null)for(var n=0;n<t.length;n++)em(e.stateNode,t[n])}function El(e){for(var t=e.return;t!==null&&(kl(t)&&em(e.stateNode,t.stateNode),!Ol(t));)t=t.return}function Dl(e){for(var t=e.return;t!==null&&(kl(t)&&tm(e.stateNode,t.stateNode),!Ol(t));)t=t.return}function Ol(e){return e.tag===5||e.tag===3||e.tag===27}function kl(e){return e&&e.tag===7&&e.stateNode!==null}function Al(e){var t=e.type,n=e.memoizedProps,r=e.stateNode;try{a:switch(t){case`button`:case`input`:case`select`:case`textarea`:n.autoFocus&&r.focus();break a;case`img`:n.src?r.src=n.src:n.srcSet&&(r.srcset=n.srcSet)}}catch(t){pf(e,e.return,t)}}function jl(e,t,n){try{var r=e.stateNode;ip(r,e.type,n,t),r[St]=t}catch(t){pf(e,e.return,t)}}function Ml(e){return e.tag===5||e.tag===3||e.tag===26||e.tag===27&&Sp(e.type)||e.tag===4}function Nl(e){a:for(;;){for(;e.sibling===null;){if(e.return===null||Ml(e.return))return null;e=e.return}for(e.sibling.return=e.return,e=e.sibling;e.tag!==5&&e.tag!==6&&e.tag!==18;){if(e.tag===27&&Sp(e.type)||e.flags&2||e.child===null||e.tag===4)continue a;e.child.return=e,e=e.child}if(!(e.flags&2))return e.stateNode}}function Pl(e,t,n,r){var i=e.tag;if(i===5||i===6)i=e.stateNode,t?(n.nodeType===9?n.body:n.nodeName===`HTML`?n.ownerDocument.body:n).insertBefore(i,t):(t=n.nodeType===9?n.body:n.nodeName===`HTML`?n.ownerDocument.body:n,t.appendChild(i),n=n._reactRootContainer,n!=null||t.onclick!==null||(t.onclick=_n)),Tl(e,r),B=!0;else if(i!==4&&(i===27&&(Tl(e,r),r=null,Sp(e.type)&&(n=e.stateNode,t=null)),e=e.child,e!==null))for(Pl(e,t,n,r),e=e.sibling;e!==null;)Pl(e,t,n,r),e=e.sibling}function Fl(e,t,n,r){var i=e.tag;if(i===5||i===6)i=e.stateNode,t?n.insertBefore(i,t):n.appendChild(i),Tl(e,r),B=!0;else if(i!==4&&(i===27&&(Tl(e,r),r=null,Sp(e.type)&&(n=e.stateNode)),e=e.child,e!==null))for(Fl(e,t,n,r),e=e.sibling;e!==null;)Fl(e,t,n,r),e=e.sibling}function Il(e){var t=e.stateNode,n=e.memoizedProps;try{for(var r=e.type,i=t.attributes;i.length;)t.removeAttributeNode(i[0]);np(t,r,n),t[xt]=e,t[St]=n}catch(t){pf(e,e.return,t)}}var Ll=!1,Rl=null;function zl(e){(e.tag===30||e.subtreeFlags&33554432)&&(Ll=!0)}var Bl=null;function Vl(){var e=Bl;return Bl=null,e}var Hl=0;function Ul(e,t,n,r,i){return Hl=0,Wl(e.child,t,n,r,i)}function Wl(e,t,n,r,i){for(var a=!1;e!==null;){if(e.tag===5){var o=e.stateNode;if(r!==null){var s=Op(o);r.push(s),s.view&&(a=!0)}else a||Op(o).view&&(a=!0);Ll=!0,Tp(o,Hl===0?t:t+`_`+Hl,n),Hl++}else e.tag===22&&e.memoizedState!==null||e.tag===30&&i||Wl(e.child,t,n,r,i)&&(a=!0);e=e.sibling}return a}function Gl(e,t){for(;e!==null;)e.tag===5?Ep(e.stateNode,e.memoizedProps):e.tag===22&&e.memoizedState!==null||e.tag===30&&t||Gl(e.child,t),e=e.sibling}function Kl(e){if(e.subtreeFlags&18874368)for(e=e.child;e!==null;){if((e.tag!==22||e.memoizedState===null)&&(Kl(e),e.tag===30&&e.flags&18874368&&e.stateNode.paired)){var t=e.memoizedProps;if(t.name==null||t.name===`auto`)throw Error(i(544));var n=t.name;t=vi(t.default,t.share),t!==`none`&&(Ul(e,n,t,null,!1)||Gl(e.child,!1))}e=e.sibling}}function ql(e,t){if(e.tag===30){var n=e.stateNode,r=e.memoizedProps,i=gi(r,n),a=vi(r.default,n.paired?r.share:r.enter);a===`none`?Kl(e):Ul(e,i,a,null,!1)?(Kl(e),n.paired||t||Md(e,r.onEnter)):Gl(e.child,!1)}else if(e.subtreeFlags&33554432)for(e=e.child;e!==null;)ql(e,t),e=e.sibling;else Kl(e)}function Jl(e){if(Rl!==null&&Rl.size!==0){var t=Rl;if(e.subtreeFlags&18874368)for(e=e.child;e!==null;){if(e.tag!==22||e.memoizedState===null){if(e.tag===30&&e.flags&18874368){var n=e.memoizedProps,r=n.name;if(r!=null&&r!==`auto`){var i=t.get(r);if(i!==void 0){var a=vi(n.default,n.share);if(a!==`none`&&(Ul(e,r,a,null,!1)?(a=e.stateNode,i.paired=a,a.paired=i,Md(e,n.onShare)):Gl(e.child,!1)),t.delete(r),t.size===0)break}}}Jl(e)}e=e.sibling}}}function Yl(e){if(e.tag===30){var t=e.memoizedProps,n=gi(t,e.stateNode),r=Rl===null?void 0:Rl.get(n),i=vi(t.default,r===void 0?t.exit:t.share);i!==`none`&&(Ul(e,n,i,null,!1)?r===void 0?Md(e,t.onExit):(i=e.stateNode,r.paired=i,i.paired=r,Rl.delete(n),Md(e,t.onShare)):Gl(e.child,!1)),Rl!==null&&Jl(e)}else if(e.subtreeFlags&33554432)for(e=e.child;e!==null;)Yl(e),e=e.sibling;else Rl!==null&&Jl(e)}function Xl(e){for(e=e.child;e!==null;){if(e.tag===30){var t=e.memoizedProps,n=gi(t,e.stateNode);t=vi(t.default,t.update),e.flags&=-5,t!==`none`&&Ul(e,n,t,e.memoizedState=[],!1)}else e.subtreeFlags&33554432&&Xl(e);e=e.sibling}}function Zl(e){if(e.subtreeFlags&18874368)for(e=e.child;e!==null;){if(e.tag!==22||e.memoizedState===null){if(e.tag===30&&e.flags&18874368){var t=e.stateNode;t.paired!==null&&(t.paired=null,Gl(e.child,!1))}Zl(e)}e=e.sibling}}function Ql(e){if(e.tag===30)e.stateNode.paired=null,Gl(e.child,!1),Zl(e);else if(e.subtreeFlags&33554432)for(e=e.child;e!==null;)Ql(e),e=e.sibling;else Zl(e)}function $l(e){for(e=e.child;e!==null;)e.tag===30?Gl(e.child,!1):e.subtreeFlags&33554432&&$l(e),e=e.sibling}function eu(e,t,n,r,i,a,o){for(var s=!1;t!==null;){if(t.tag===5){var c=t.stateNode;if(a!==null&&Hl<a.length){var l=a[Hl],u=Op(c);(l.view||u.view)&&(s=!0);var d;if(d=!(e.flags&4)){if(u.clip)d=!0;else{d=l.rect;var f=u.rect;d=d.y!==f.y||d.x!==f.x||d.height!==f.height||d.width!==f.width}}d&&(e.flags|=4),u.abs?u=!l.abs:(l=l.rect,u=u.rect,u=l.height!==u.height||l.width!==u.width),u&&(e.flags|=32)}else e.flags|=32;e.flags&4&&Tp(c,Hl===0?n:n+`_`+Hl,i),s&&e.flags&4||(Bl===null&&(Bl=[]),Bl.push(c,Hl===0?r:r+`_`+Hl,t.memoizedProps)),Hl++}else(t.tag!==22||t.memoizedState===null)&&(t.tag===30&&o?e.flags|=t.flags&32:eu(e,t.child,n,r,i,a,o)&&(s=!0));t=t.sibling}return s}function tu(e,t){for(e=e.child;e!==null;){if(e.tag===30){var n=e.memoizedProps,r=e.stateNode,i=gi(n,r),a=vi(n.default,n.update);if(t){r=r.clones;var o=r===null?null:r.map(kp)}else o=e.memoizedState,e.memoizedState=null;r=e;var s=e.child;Hl=0,i=eu(r,s,i,i,a,o,!1),e.flags&4&&i&&(t||Md(e,n.onUpdate))}else e.subtreeFlags&33554432&&tu(e,t);e=e.sibling}}var nu=!1,q=!1,ru=!1,iu=!1,au=typeof WeakSet==`function`?WeakSet:Set,ou=null,su=!1,cu=!1,lu=!1,uu=!1;function du(e,t,n){if(e=e.containerInfo,sp=gh,e=Kr(e),qr(e)){if(`selectionStart`in e)var r={start:e.selectionStart,end:e.selectionEnd};else a:{r=(r=e.ownerDocument)&&r.defaultView||window;var i=r.getSelection&&r.getSelection();if(i&&i.rangeCount!==0){r=i.anchorNode;var a=i.anchorOffset,o=i.focusNode;i=i.focusOffset;try{r.nodeType,o.nodeType}catch{r=null;break a}var s=0,c=-1,l=-1,u=0,d=0,f=e,p=null;b:for(;;){for(var m;f!==r||a!==0&&f.nodeType!==3||(c=s+a),f!==o||i!==0&&f.nodeType!==3||(l=s+i),f.nodeType===3&&(s+=f.nodeValue.length),(m=f.firstChild)!==null;)p=f,f=m;for(;;){if(f===e)break b;if(p===r&&++u===a&&(c=s),p===o&&++d===i&&(l=s),(m=f.nextSibling)!==null)break;f=p,p=f.parentNode}f=m}r=c===-1||l===-1?null:{start:c,end:l}}else r=null}r||={start:0,end:0}}else r=null;for(cp={focusedElem:e,selectionRange:r},gh=!1,n=(n&335544064)===n,ou=t,t=n?9270:1024;ou!==null;){if(e=ou,n&&(r=e.deletions,r!==null))for(a=0;a<r.length;a++)n&&Yl(r[a]);if(e.alternate===null&&e.flags&2)n&&zl(e),fu(n);else{if(e.tag===22){if(r=e.alternate,e.memoizedState!==null){r!==null&&r.memoizedState===null&&n&&Yl(r),fu(n);continue}if(r!==null&&r.memoizedState!==null){n&&zl(e),fu(n);continue}}r=e.child,(e.subtreeFlags&t)!==0&&r!==null?(r.return=e,ou=r):(n&&Xl(e),fu(n))}}Rl=null}function fu(e){for(;ou!==null;){var t=ou,n=e,r=t.alternate,a=t.flags;switch(t.tag){case 0:case 11:case 15:break;case 1:if(a&1024&&r!==null){n=void 0,a=r.memoizedProps,r=r.memoizedState;var o=t.stateNode;try{var s=bc(t.type,a);n=o.getSnapshotBeforeUpdate(s,r),o.__reactInternalSnapshotBeforeUpdate=n}catch(e){pf(t,t.return,e)}}break;case 3:if(a&1024){if(r=t.stateNode.containerInfo,n=r.nodeType,n===9)nm(r);else if(n===1)switch(r.nodeName){case`HEAD`:case`HTML`:case`BODY`:nm(r);break;default:r.textContent=``}}break;case 5:case 26:case 27:case 6:case 4:case 17:break;case 30:n&&r!==null&&(n=gi(r.memoizedProps,r.stateNode),a=t.memoizedProps,a=vi(a.default,a.update),a!==`none`&&Ul(r,n,a,r.memoizedState=[],!0));break;default:if(a&1024)throw Error(i(163))}if(r=t.sibling,r!==null){r.return=t.return,ou=r;break}ou=t.return}}function pu(e,t,n){var r=n.flags;switch(n.tag){case 0:case 11:case 15:Nu(e,n),r&4&&yl(5,n);break;case 1:if(Nu(e,n),r&4){if(e=n.stateNode,t===null)try{e.componentDidMount()}catch(e){pf(n,n.return,e)}else{var i=bc(n.type,t.memoizedProps);t=t.memoizedState;try{e.componentDidUpdate(i,t,e.__reactInternalSnapshotBeforeUpdate)}catch(e){pf(n,n.return,e)}}}r&64&&xl(n),r&512&&Cl(n,n.return);break;case 3:if(Nu(e,n),r&64&&(e=n.updateQueue,e!==null)){if(t=null,n.child!==null)switch(n.child.tag){case 27:case 5:t=n.child.stateNode;break;case 1:t=n.child.stateNode}try{Co(e,t)}catch(e){pf(n,n.return,e)}}break;case 27:t===null&&r&4&&Il(n);case 26:case 5:Nu(e,n),t===null&&r&4&&Al(n),r&512&&Cl(n,n.return);break;case 12:Nu(e,n);break;case 31:Nu(e,n),r&4&&Su(e,n);break;case 13:Nu(e,n),r&4&&Cu(e,n),r&64&&(e=n.memoizedState,e!==null&&(e=e.dehydrated,e!==null&&(n=_f.bind(null,n),cm(e,n))));break;case 22:if(r=n.memoizedState!==null||nu,!r){var a=t!==null&&t.memoizedState!==null||q;t=nu,i=q,nu=r,(q=a)&&!i?(r=2,n.subtreeFlags&8772&&(r|=1),Fu(e,n,r)):Nu(e,n),nu=t,q=i}break;case 30:Nu(e,n),r&512&&Cl(n,n.return);break;case 7:r&512&&Cl(n,n.return);default:Nu(e,n)}}function mu(e,t){for(e=e.child;e!==null;)hu(e,t),e=e.sibling}function hu(e,t){switch(e.tag){case 5:case 26:try{var n=e.stateNode;if(t){var r=n.style;typeof r.setProperty==`function`?r.setProperty(`display`,`none`,`important`):r.display=`none`}else{var i=e.stateNode,a=e.memoizedProps.style,o=a!=null&&a.hasOwnProperty(`display`)?a.display:null;i.style.display=o==null||typeof o==`boolean`?``:(``+o).trim()}}catch(t){pf(e,e.return,t)}gu(e,t);break;case 6:try{e.stateNode.nodeValue=t?``:e.memoizedProps,B=!0}catch(t){pf(e,e.return,t)}break;case 18:try{var s=e.stateNode;t?wp(s,!0):wp(e.stateNode,!1)}catch(t){pf(e,e.return,t)}break;case 22:case 23:e.memoizedState===null&&mu(e,t);break;default:mu(e,t)}}function gu(e,t){if(e.subtreeFlags&67108864)for(e=e.child;e!==null;){a:{var n=e,r=t;switch(n.tag){case 4:hu(n,r);break a;case 22:n.memoizedState===null&&gu(n,r);break a;default:gu(n,r)}}e=e.sibling}}function _u(e){var t=e.alternate;t!==null&&(e.alternate=null,_u(t)),e.child=null,e.deletions=null,e.sibling=null,e.tag===5&&(t=e.stateNode,t!==null&&At(t)),e.stateNode=null,e.return=null,e.dependencies=null,e.memoizedProps=null,e.memoizedState=null,e.pendingProps=null,e.stateNode=null,e.updateQueue=null}var vu=null,yu=!1;function bu(e,t,n){for(n=n.child;n!==null;)xu(e,t,n),n=n.sibling}function xu(e,t,n){if(Ye&&typeof Ye.onCommitFiberUnmount==`function`)try{Ye.onCommitFiberUnmount(Je,n)}catch{}switch(n.tag){case 26:q||wl(n,t),bu(e,t,n),n.memoizedState?n.memoizedState.count--:n.stateNode&&!q&&(n=n.stateNode,n.parentNode.removeChild(n));break;case 27:q||wl(n,t),Dl(n);var r=vu,i=yu;Sp(n.type)&&(vu=n.stateNode,yu=!1),bu(e,t,n),gm(n.stateNode,n.type,n.memoizedProps),vu=r,yu=i;break;case 5:q||wl(n,t),Dl(n);case 6:if(n.tag===6&&Dl(n),r=vu,i=yu,vu=null,bu(e,t,n),vu=r,yu=i,vu!==null){if(yu)try{(vu.nodeType===9?vu.body:vu.nodeName===`HTML`?vu.ownerDocument.body:vu).removeChild(n.stateNode),B=!0}catch(e){pf(n,t,e)}else try{vu.removeChild(n.stateNode),B=!0}catch(e){pf(n,t,e)}}break;case 18:vu!==null&&(yu?(e=vu,Cp(e.nodeType===9?e.body:e.nodeName===`HTML`?e.ownerDocument.body:e,n.stateNode),Hh(e)):Cp(vu,n.stateNode));break;case 4:r=vu,i=yu,vu=n.stateNode.containerInfo,yu=!0,bu(e,t,n),vu=r,yu=i;break;case 0:case 11:case 14:case 15:bl(2,n,t),q||bl(4,n,t),bu(e,t,n);break;case 1:q||(wl(n,t),r=n.stateNode,typeof r.componentWillUnmount==`function`&&Sl(n,t,r)),bu(e,t,n);break;case 21:bu(e,t,n);break;case 22:q=(r=q)||n.memoizedState!==null,bu(e,t,n),q=r;break;case 30:wl(n,t),bu(e,t,n);break;case 7:q||wl(n,t),bu(e,t,n);break;default:bu(e,t,n)}}function Su(e,t){if(t.memoizedState===null&&(e=t.alternate,e!==null&&(e=e.memoizedState,e!==null))){e=e.dehydrated;try{Hh(e)}catch(e){pf(t,t.return,e)}}}function Cu(e,t){if(t.memoizedState===null&&(e=t.alternate,e!==null&&(e=e.memoizedState,e!==null&&(e=e.dehydrated,e!==null))))try{Hh(e)}catch(e){pf(t,t.return,e)}}function wu(e){switch(e.tag){case 31:case 13:case 19:var t=e.stateNode;return t===null&&(t=e.stateNode=new au),t;case 22:return e=e.stateNode,t=e._retryCache,t===null&&(t=e._retryCache=new au),t;default:throw Error(i(435,e.tag))}}function Tu(e,t){var n=wu(e);t.forEach(function(t){if(!n.has(t)){n.add(t);var r=vf.bind(null,e,t);t.then(r,r)}})}function Eu(e,t,n){var r=t.deletions;if(r!==null)for(var a=0;a<r.length;a++){var o=r[a],s=e,c=t,l=c;a:for(;l!==null;){switch(l.tag){case 27:if(Sp(l.type)){vu=l.stateNode,yu=!1;break a}break;case 5:vu=l.stateNode,yu=!1;break a;case 3:case 4:vu=l.stateNode.containerInfo,yu=!0;break a}l=l.return}if(vu===null)throw Error(i(160));xu(s,c,o),vu=null,yu=!1,s=o.alternate,s!==null&&(s.return=null),o.return=null}if(t.subtreeFlags&13886)for(t=t.child;t!==null;)Ou(t,e,n),t=t.sibling}var Du=null;function Ou(e,t,n){var r=e.alternate,a=e.flags;switch(e.tag){case 0:case 11:case 14:case 15:if(a&4&&(r=e.updateQueue,r=r===null?null:r.events,r!==null))for(var o=0;o<r.length;o++){var s=r[o];s.ref.impl=s.nextImpl}Eu(t,e,n),ku(e),a&4&&(bl(3,e,e.return),yl(3,e),bl(5,e,e.return));break;case 1:Eu(t,e,n),ku(e),a&512&&(q||r===null||wl(r,r.return)),a&64&&nu&&(e=e.updateQueue,e!==null&&(t=e.callbacks,t!==null&&(n=e.shared.hiddenCallbacks,e.shared.hiddenCallbacks=n===null?t:n.concat(t))));break;case 26:if(o=Du,Eu(t,e,n),ku(e),a&512&&(q||r===null||wl(r,r.return)),a&4){if(a=r===null?null:r.memoizedState,n=e.memoizedState,r===null){if(n===null){if(e.stateNode===null){if(nu)e.stateNode=fp(e.type,e.memoizedProps,t.containerInfo,e);else{a:{t=e.type,n=e.memoizedProps,a=o.ownerDocument||o;b:switch(t){case`title`:r=a.getElementsByTagName(`title`)[0],(!r||r[Ot]||r[xt]||r.namespaceURI===`http://www.w3.org/2000/svg`||r.hasAttribute(`itemprop`))&&(r=a.createElement(t),a.head.insertBefore(r,a.querySelector(`head > title`))),np(r,t,n),r[xt]=e,Ft(r),t=r;break a;case`link`:if(o=Gm(`link`,`href`,a).get(t+(n.href||``))){for(s=0;s<o.length;s++)if(r=o[s],r.getAttribute(`href`)===(n.href==null||n.href===``?null:n.href)&&r.getAttribute(`rel`)===(n.rel==null?null:n.rel)&&r.getAttribute(`title`)===(n.title==null?null:n.title)&&r.getAttribute(`crossorigin`)===(n.crossOrigin==null?null:n.crossOrigin)){o.splice(s,1);break b}}r=a.createElement(t),np(r,t,n),a.head.appendChild(r);break;case`meta`:if(o=Gm(`meta`,`content`,a).get(t+(n.content||``))){for(s=0;s<o.length;s++)if(r=o[s],r.getAttribute(`content`)===(n.content==null?null:``+n.content)&&r.getAttribute(`name`)===(n.name==null?null:n.name)&&r.getAttribute(`property`)===(n.property==null?null:n.property)&&r.getAttribute(`http-equiv`)===(n.httpEquiv==null?null:n.httpEquiv)&&r.getAttribute(`charset`)===(n.charSet==null?null:n.charSet)){o.splice(s,1);break b}}r=a.createElement(t),np(r,t,n),a.head.appendChild(r);break;default:throw Error(i(468,t))}r[xt]=e,Ft(r),t=r}e.stateNode=t}}else nu||Km(o,e.type,e.stateNode)}else e.stateNode=Bm(o,n,e.memoizedProps)}else a===n?n===null&&e.stateNode!==null&&jl(e,e.memoizedProps,r.memoizedProps):(a===null?(t=r.stateNode,t===null||q||t.parentNode.removeChild(t)):a.count--,n===null?nu||Km(o,e.type,e.stateNode):Bm(o,n,e.memoizedProps))}break;case 27:Eu(t,e,n),ku(e),a&512&&(q||r===null||wl(r,r.return)),r!==null&&a&4&&jl(e,e.memoizedProps,r.memoizedProps);break;case 5:if(o=ru,ru=!1,Eu(t,e,n),ru=o,ku(e),a&512&&(q||r===null||wl(r,r.return)),e.flags&32){t=e.stateNode;try{ln(t,``),B=!0}catch(t){pf(e,e.return,t)}}a&4&&e.stateNode!=null&&(t=e.memoizedProps,jl(e,t,r===null?t:r.memoizedProps)),a&1024&&(iu=!0);break;case 6:if(Eu(t,e,n),ku(e),a&4){if(e.stateNode===null)throw Error(i(162));t=e.memoizedProps,n=e.stateNode;try{n.nodeValue=t,B=!0}catch(t){pf(e,e.return,t)}}break;case 3:if(B=!1,Wm=null,o=Du,Du=bm(t.containerInfo),Eu(t,e,n),Du=o,ku(e),a&4&&r!==null&&r.memoizedState.isDehydrated)try{Hh(t.containerInfo)}catch(t){pf(e,e.return,t)}iu&&(iu=!1,Au(e)),B=!1;break;case 4:a=ru,ru=nu,r=Gt(),o=Du,Du=bm(e.stateNode.containerInfo),Eu(t,e,n),ku(e),Du=o,B&&cu&&(lu=!0),B=r,ru=a;break;case 12:Eu(t,e,n),ku(e);break;case 31:Eu(t,e,n),ku(e),a&4&&(t=e.updateQueue,t!==null&&(e.updateQueue=null,Tu(e,t)));break;case 13:Eu(t,e,n),ku(e),e.child.flags&8192&&e.memoizedState!==null!=(r!==null&&r.memoizedState!==null)&&(pd=ze()),a&4&&(t=e.updateQueue,t!==null&&(e.updateQueue=null,Tu(e,t)));break;case 22:o=e.memoizedState!==null,s=r!==null&&r.memoizedState!==null;var c=nu,l=q,u=ru;nu=c||o,ru=u||o,q=l||s,Eu(t,e,n),q=l,ru=u,nu=c,ku(e),a&8192&&(t=e.stateNode,t._visibility=o?t._visibility&-2:t._visibility|1,!o||r===null||s||nu||q||(t=s||q,n=nu,r=q,nu=o||nu,q=t,Pu(e,2),nu=n,q=r),!o&&ru||mu(e,o)),a&4&&(t=e.updateQueue,t!==null&&(n=t.retryQueue,n!==null&&(t.retryQueue=null,Tu(e,n))));break;case 19:Eu(t,e,n),ku(e),a&4&&(t=e.updateQueue,t!==null&&(e.updateQueue=null,Tu(e,t)));break;case 30:a&512&&(q||r===null||wl(r,r.return)),a=Gt(),o=cu,s=(n&335544064)===n,c=e.memoizedProps,cu=s&&vi(c.default,c.update)!==`none`,Eu(t,e,n),ku(e),s&&r!==null&&B&&(e.flags|=4),cu=o,B=a;break;case 21:break;case 7:a&512&&(q||r===null||wl(r,r.return)),r&&r.stateNode!==null&&(r.stateNode._fragmentFiber=e);default:Eu(t,e,n),ku(e)}}function ku(e){var t=e.flags;if(t&2){try{for(var n,r=e.return;r!==null;){if(Ml(r)){n=r;break}r=r.return}r=null;for(var a=e.return;a!==null;){if(kl(a)){var o=a.stateNode;r===null?r=[o]:r.push(o)}if(Ol(a))break;a=a.return}var s=r;if(n==null)throw Error(i(160));switch(n.tag){case 27:var c=n.stateNode;Fl(e,Nl(e),c,s);break;case 5:var l=n.stateNode;n.flags&32&&(ln(l,``),n.flags&=-33),Fl(e,Nl(e),l,s);break;case 3:case 4:var u=n.stateNode.containerInfo;Pl(e,Nl(e),u,s);break;default:throw Error(i(161))}}catch(t){pf(e,e.return,t)}e.flags&=-3}t&4096&&(e.flags&=-4097)}function Au(e){if(e.subtreeFlags&1024)for(e=e.child;e!==null;){var t=e;Au(t),t.tag===5&&t.flags&1024&&(t=t.stateNode,gh=!0,t.reset(),gh=!1),e=e.sibling}}function ju(e,t){if(t.subtreeFlags&9270)for(t=t.child;t!==null;)Mu(t,e),t=t.sibling;else tu(t,!1)}function Mu(e,t){var n=e.alternate;if(n===null)ql(e,!1);else switch(e.tag){case 3:if(uu=su=!1,Vl(),ju(t,e),!su&&!lu){if(e=Bl,e!==null)for(var r=0;r<e.length;r+=3){n=e[r];var i=e[r+1];Ep(n,e[r+2]),n=n.ownerDocument.documentElement,n!==null&&n.animate({opacity:[0,0],pointerEvents:[`none`,`none`]},{duration:0,fill:`forwards`,pseudoElement:`::view-transition-group(`+i+`)`})}e=t.containerInfo,e=e.nodeType===9?e.documentElement:e.ownerDocument.documentElement,e!==null&&e.style.viewTransitionName===``&&(e.style.viewTransitionName=`none`,e.animate({opacity:[0,0],pointerEvents:[`none`,`none`]},{duration:0,fill:`forwards`,pseudoElement:`::view-transition-group(root)`}),e.animate({width:[0,0],height:[0,0]},{duration:0,fill:`forwards`,pseudoElement:`::view-transition`})),uu=!0}Bl=null;break;case 5:ju(t,e);break;case 4:r=su,su=!1,ju(t,e),su&&(lu=!0),su=r;break;case 22:e.memoizedState===null&&(n.memoizedState===null?ju(t,e):ql(e,!1));break;case 30:r=su,i=Vl(),su=!1,ju(t,e),su&&(e.flags|=4);var a=e.memoizedProps,o=e.stateNode;t=gi(a,o),o=gi(n.memoizedProps,o);var s=vi(a.default,a.update);s===`none`?t=!1:(a=n.memoizedState,n.memoizedState=null,n=e.child,Hl=0,t=eu(e,n,t,o,s,a,!0),Hl!==(a===null?0:a.length)&&(e.flags|=32)),e.flags&4&&t?(Md(e,e.memoizedProps.onUpdate),Bl=i):i!==null&&(i.push.apply(i,Bl),Bl=i),su=e.flags&32?!0:r;break;default:ju(t,e)}}function Nu(e,t){if(t.subtreeFlags&8772)for(t=t.child;t!==null;)pu(e,t.alternate,t),t=t.sibling}function Pu(e,t){for(e=e.child;e!==null;){var n=e,r=t;switch(n.tag){case 0:case 11:case 14:case 15:bl(4,n,n.return),Pu(n,r);break;case 1:wl(n,n.return);var i=n.stateNode;typeof i.componentWillUnmount==`function`&&Sl(n,n.return,i),Pu(n,r);break;case 27:r&2&&gm(n.stateNode,n.type,n.memoizedProps);case 5:wl(n,n.return),n.tag!==5&&n.tag!==27||Dl(n),Pu(n,r);break;case 6:Dl(n);break;case 26:wl(n,n.return),i=n.stateNode,n.memoizedState!==null||i===null||q||i.parentNode.removeChild(i),Pu(n,r);break;case 22:n.memoizedState===null&&Pu(n,r);break;case 30:wl(n,n.return),Pu(n,r);break;case 7:wl(n,n.return);default:Pu(n,r)}e=e.sibling}}function Fu(e,t,n){for(n=t.subtreeFlags&8772?n:n&-2,t=t.child;t!==null;){var r=t.alternate,i=e,a=t,o=a.flags,s=!!(n&1);switch(a.tag){case 0:case 11:case 15:Fu(i,a,n),yl(4,a);break;case 1:if(Fu(i,a,n),r=a,i=r.stateNode,typeof i.componentDidMount==`function`)try{i.componentDidMount()}catch(e){pf(r,r.return,e)}if(r=a,i=r.updateQueue,i!==null){var c=r.stateNode;try{var l=i.shared.hiddenCallbacks;if(l!==null)for(i.shared.hiddenCallbacks=null,i=0;i<l.length;i++)So(l[i],c)}catch(e){pf(r,r.return,e)}}s&&o&64&&xl(a),Cl(a,a.return);break;case 27:n&2&&Il(a);case 5:a.tag!==5&&a.tag!==27||El(a),Fu(i,a,n),s&&r===null&&o&4&&Al(a),Cl(a,a.return);break;case 6:El(a);break;case 26:c=a.stateNode,a.memoizedState!==null||c===null||nu||Km(bm(c.ownerDocument),a.type,c),Fu(i,a,n),s&&r===null&&o&4&&Al(a),Cl(a,a.return);break;case 12:Fu(i,a,n);break;case 31:Fu(i,a,n),s&&o&4&&Su(i,a);break;case 13:Fu(i,a,n),s&&o&4&&Cu(i,a);break;case 22:a.memoizedState===null&&Fu(i,a,n),Cl(a,a.return);break;case 30:Fu(i,a,n),Cl(a,a.return);break;case 7:Cl(a,a.return);default:Fu(i,a,n)}t=t.sibling}}function Iu(e,t){var n=null;e!==null&&e.memoizedState!==null&&e.memoizedState.cachePool!==null&&(n=e.memoizedState.cachePool.pool),e=null,t.memoizedState!==null&&t.memoizedState.cachePool!==null&&(e=t.memoizedState.cachePool.pool),e!==n&&(e!=null&&e.refCount++,n!=null&&Ma(n))}function Lu(e,t){e=null,t.alternate!==null&&(e=t.alternate.memoizedState.cache),t=t.memoizedState.cache,t!==e&&(t.refCount++,e!=null&&Ma(e))}function Ru(e,t,n,r){var i=(n&335544064)===n;if(t.subtreeFlags&(i?10262:10256))for(t=t.child;t!==null;)zu(e,t,n,r),t=t.sibling;else i&&$l(t)}function zu(e,t,n,r){var i=(n&335544064)===n;i&&t.alternate===null&&t.return!==null&&t.return.alternate!==null&&Ql(t);var a=t.flags;switch(t.tag){case 0:case 11:case 15:Ru(e,t,n,r),a&2048&&yl(9,t);break;case 1:Ru(e,t,n,r);break;case 3:Ru(e,t,n,r),i&&uu&&(e=e.containerInfo,e=e.nodeType===9?e.body:e.nodeName===`HTML`?e.ownerDocument.body:e,e.style.viewTransitionName===`root`&&(e.style.viewTransitionName=``),e=e.ownerDocument.documentElement,e!==null&&e.style.viewTransitionName===`none`&&(e.style.viewTransitionName=``)),a&2048&&(a=null,t.alternate!==null&&(a=t.alternate.memoizedState.cache),t=t.memoizedState.cache,t!==a&&(t.refCount++,a!=null&&Ma(a)));break;case 12:if(a&2048){Ru(e,t,n,r),a=t.stateNode;try{var o=t.memoizedProps,s=o.id,c=o.onPostCommit;typeof c==`function`&&c(s,t.alternate===null?`mount`:`update`,a.passiveEffectDuration,-0)}catch(e){pf(t,t.return,e)}}else Ru(e,t,n,r);break;case 31:Ru(e,t,n,r);break;case 13:Ru(e,t,n,r);break;case 23:break;case 22:o=t.stateNode,s=t.alternate,t.memoizedState===null?(i&&s!==null&&s.memoizedState!==null&&Ql(t),o._visibility&2?Ru(e,t,n,r):(o._visibility|=2,Bu(e,t,n,r,!!(t.subtreeFlags&10256)||!1))):(i&&s!==null&&s.memoizedState===null&&Ql(s),o._visibility&2?Ru(e,t,n,r):Vu(e,t)),a&2048&&Iu(s,t);break;case 24:Ru(e,t,n,r),a&2048&&Lu(t.alternate,t);break;case 30:i&&(a=t.alternate,a!==null&&(Gl(a.child,!0),Gl(t.child,!0))),Ru(e,t,n,r);break;default:Ru(e,t,n,r)}}function Bu(e,t,n,r,i){for(i&&=!!(t.subtreeFlags&10256)||!1,t=t.child;t!==null;){var a=e,o=t,s=n,c=r,l=o.flags;switch(o.tag){case 0:case 11:case 15:Bu(a,o,s,c,i),yl(8,o);break;case 23:break;case 22:var u=o.stateNode;o.memoizedState===null?(u._visibility|=2,Bu(a,o,s,c,i)):u._visibility&2?Bu(a,o,s,c,i):Vu(a,o),i&&l&2048&&Iu(o.alternate,o);break;case 24:Bu(a,o,s,c,i),i&&l&2048&&Lu(o.alternate,o);break;default:Bu(a,o,s,c,i)}t=t.sibling}}function Vu(e,t){if(t.subtreeFlags&10256)for(t=t.child;t!==null;){var n=e,r=t,i=r.flags;switch(r.tag){case 22:Vu(n,r),i&2048&&Iu(r.alternate,r);break;case 24:Vu(n,r),i&2048&&Lu(r.alternate,r);break;default:Vu(n,r)}t=t.sibling}}var Hu=8192;function Uu(e,t,n){if(e.subtreeFlags&Hu)for(e=e.child;e!==null;)Wu(e,t,n),e=e.sibling}function Wu(e,t,n){switch(e.tag){case 26:Uu(e,t,n),e.flags&Hu&&(e.memoizedState===null?(e=e.stateNode,(t&335544128)===t&&Zm(n,e)):Qm(n,Du,e.memoizedState,e.memoizedProps));break;case 5:Uu(e,t,n),e.flags&Hu&&(e=e.stateNode,(t&335544128)===t&&Zm(n,e));break;case 3:case 4:var r=Du;Du=bm(e.stateNode.containerInfo),Uu(e,t,n),Du=r;break;case 22:e.memoizedState===null&&(r=e.alternate,r!==null&&r.memoizedState!==null?(r=Hu,Hu=16777216,Uu(e,t,n),Hu=r):Uu(e,t,n));break;case 30:if((e.flags&Hu)!==0&&(r=e.memoizedProps.name,r!=null&&r!==`auto`)){var i=e.stateNode;i.paired=null,Rl===null&&(Rl=new Map),Rl.set(r,i)}Uu(e,t,n);break;default:Uu(e,t,n)}}function Gu(e){var t=e.alternate;if(t!==null&&(e=t.child,e!==null)){t.child=null;do t=e.sibling,e.sibling=null,e=t;while(e!==null)}}function Ku(e){var t=e.deletions;if(e.flags&16){if(t!==null)for(var n=0;n<t.length;n++){var r=t[n];ou=r,Yu(r,e)}Gu(e)}if(e.subtreeFlags&10256)for(e=e.child;e!==null;)qu(e),e=e.sibling}function qu(e){switch(e.tag){case 0:case 11:case 15:Ku(e),e.flags&2048&&bl(9,e,e.return);break;case 3:Ku(e);break;case 12:Ku(e);break;case 22:var t=e.stateNode;e.memoizedState!==null&&t._visibility&2&&(e.return===null||e.return.tag!==13)?(t._visibility&=-3,Ju(e)):Ku(e);break;default:Ku(e)}}function Ju(e){var t=e.deletions;if(e.flags&16){if(t!==null)for(var n=0;n<t.length;n++){var r=t[n];ou=r,Yu(r,e)}Gu(e)}for(e=e.child;e!==null;){switch(t=e,t.tag){case 0:case 11:case 15:bl(8,t,t.return),Ju(t);break;case 22:n=t.stateNode,n._visibility&2&&(n._visibility&=-3,Ju(t));break;default:Ju(t)}e=e.sibling}}function Yu(e,t){for(;ou!==null;){var n=ou;switch(n.tag){case 0:case 11:case 15:bl(8,n,t);break;case 23:case 22:if(n.memoizedState!==null&&n.memoizedState.cachePool!==null){var r=n.memoizedState.cachePool.pool;r!=null&&r.refCount++}break;case 24:Ma(n.memoizedState.cache)}if(r=n.child,r!==null)r.return=n,ou=r;else a:for(n=e;ou!==null;){r=ou;var i=r.sibling,a=r.return;if(_u(r),r===n){ou=null;break a}if(i!==null){i.return=a,ou=i;break a}ou=a}}}var Xu={getCacheForType:function(e){var t=wa(Aa),n=t.data.get(e);return n===void 0&&(n=e(),t.data.set(e,n)),n},cacheSignal:function(){return wa(Aa).controller.signal}},Zu=typeof WeakMap==`function`?WeakMap:Map,J=0,Qu=null,Y=null,X=0,Z=0,$u=null,ed=!1,td=!1,nd=!1,rd=0,id=0,ad=0,od=0,sd=0,cd=0,ld=0,ud=null,dd=null,fd=!1,pd=0,md=0,hd=1/0,gd=null,_d=null,vd=0,yd=null,bd=null,xd=0,Sd=0,Cd=null,wd=null,Td=null,Ed=null,Dd=null,Od=0,kd=null;function Ad(){return J&2&&X!==0?X&-X:F.T===null?vt():Pf()}function jd(){if(cd===0){if(!(X&536870912)||V){var e=nt;nt<<=1,!(nt&3932160)&&(nt=262144),cd=e}else cd=536870912}return e=ko.current,e!==null&&(e.flags|=32),cd}function Md(e,t){if(t!=null){var n=e.stateNode,r=n.ref;r===null&&(r=n.ref=Pp(gi(e.memoizedProps,n))),Ed===null&&(Ed=[]),Ed.push(t.bind(null,r))}}function Nd(e,t,n){(e===Qu&&(Z===2||Z===9)||e.cancelPendingCommit!==null)&&(Bd(e,0),Ld(e,X,cd,!1)),dt(e,n),J&2&&e===Qu||(e===Qu&&(!(J&2)&&(od|=n),id===4&&Ld(e,X,cd,!1)),Ef(e))}function Pd(e,t,n){if(J&6)throw Error(i(327));var r=!n&&!(t&127)&&(t&e.expiredLanes)===0||ot(e,t),a=r?Jd(e,t):Kd(e,t,!0),o=r;do{if(a===0){td&&!r&&Ld(e,t,0,!1);break}if(n=e.current.alternate,o&&!Id(n))a=Kd(e,t,!1),o=!1;else{if(a===2){if(o=t,e.errorRecoveryDisabledLanes&o)var s=0;else s=e.pendingLanes&-536870913,s=s===0?s&536870912?536870912:0:s;if(s!==0){t=s;a:{var c=e;a=ud;var l=c.current.memoizedState.isDehydrated;if(l&&(Bd(c,s).flags|=256),s=Kd(c,s,!1),s!==2&&s!==6){if(nd&&!l){c.errorRecoveryDisabledLanes|=o,od|=o,a=4;break a}o=dd,dd=a,o!==null&&(dd===null?dd=o:dd.push.apply(dd,o))}a=s}if(o=!1,a!==2)continue}}if(a===1){Bd(e,0),Ld(e,t,0,!0);break}a:{switch(r=e,o=a,o){case 0:case 1:throw Error(i(345));case 4:if((t&4194048)!==t&&(t&62914560)!==t)break;case 6:Ld(r,t,cd,!ed);break a;case 2:dd=null;break;case 3:case 5:break;default:throw Error(i(329))}if((t&62914560)===t&&(a=pd+300-ze(),10<a)){if(Ld(r,t,cd,!ed),at(r,0,!0)!==0)break a;xd=t,r.timeoutHandle=gp(Fd.bind(null,r,n,dd,gd,fd,t,cd,od,ld,ed,o,`Throttled`,-0,0),a);break a}Fd(r,n,dd,gd,fd,t,cd,od,ld,ed,o,null,-0,0)}break}}while(1);Ef(e)}function Fd(e,t,n,r,i,a,o,s,c,l,u,d,f,p){e.timeoutHandle=-1;var m=t.subtreeFlags,h=(a&335544064)===a;d=null,(h||m&8192||(m&16785408)==16785408)&&(d={stylesheets:null,count:0,imgCount:0,imgBytes:0,suspenseyImages:[],waitingForImages:!0,waitingForViewTransition:!1,unsuspend:_n},Rl=null,Wu(t,a,d),h&&(m=d,h=e.containerInfo,h=(h.nodeType===9?h:h.ownerDocument).__reactViewTransition,h!=null&&(m.count++,m.waitingForViewTransition=!0,m=nh.bind(m),h.finished.then(m,m))),m=(a&62914560)===a?pd-ze():(a&4194048)===a?md-ze():0,m=eh(d,m),m!==null)?(xd=a,e.cancelPendingCommit=m(tf.bind(null,e,t,a,n,r,i,o,s,c,l,u,d,null,f,p)),Ld(e,a,o,!l)):tf(e,t,a,n,r,i,o,s,c,l,u,d)}function Id(e){for(var t=e;;){var n=t.tag;if((n===0||n===11||n===15)&&t.flags&16384&&(n=t.updateQueue,n!==null&&(n=n.stores,n!==null)))for(var r=0;r<n.length;r++){var i=n[r],a=i.getSnapshot;i=i.value;try{if(!Br(a(),i))return!1}catch{return!1}}if(n=t.child,t.subtreeFlags&16384&&n!==null)n.return=t,t=n;else{if(t===e)break;for(;t.sibling===null;){if(t.return===null||t.return===e)return!0;t=t.return}t.sibling.return=t.return,t=t.sibling}}return!0}function Ld(e,t,n,r){t=st(e,t),t&=~sd,t&=~od,e.suspendedLanes|=t,e.pingedLanes&=~t,r&&(e.warmLanes|=t),r=e.expirationTimes;for(var i=t;0<i;){var a=31-Ze(i),o=1<<a;r[a]=-1,i&=~o}n!==0&&pt(e,n,t)}function Rd(){return J&6?!0:(Df(0,!1),!1)}function zd(){if(Y!==null){if(Z===0)var e=Y.return;else e=Y,ga=ha=null,ns(e),io=null,ao=0,e=Y;for(;e!==null;)vl(e.alternate,e),e=e.return;Y=null}}function Bd(e,t){var n=e.timeoutHandle;return n!==-1&&(e.timeoutHandle=-1,_p(n)),n=e.cancelPendingCommit,n!==null&&(e.cancelPendingCommit=null,n()),xd=0,zd(),Qu=e,Y=n=Ni(e.current,null),X=t,Z=0,$u=null,ed=!1,td=ot(e,t),nd=!1,ld=cd=sd=od=ad=id=0,dd=ud=null,fd=!1,rd=st(e,t),Ci(),n}function Vd(e,t){U=null,F.H=fc,t===Ja||t===Xa?(t=no(),Z=3):t===Ya?(t=no(),Z=4):Z=t===Ac?8:typeof t==`object`&&t&&typeof t.then==`function`?6:1,$u=t,Y===null&&(id=1,wc(e,Vi(t,e.current)))}function Hd(){var e=ko.current;return e===null?!0:(X&4194048)===X?Ao===null:(X&62914560)===X||X&536870912?e===Ao:!1}function Ud(){var e=F.H;return F.H=fc,e===null?fc:e}function Wd(){var e=F.A;return F.A=Xu,e}function Gd(){id=4,ed||(X&4194048)!==X&&ko.current!==null||(td=!0),!(ad&134217727)&&!(od&134217727)||Qu===null||Ld(Qu,X,cd,!1)}function Kd(e,t,n){var r=J;J|=2;var i=Ud(),a=Wd();(Qu!==e||X!==t)&&(gd=null,Bd(e,t)),t=!1;var o=id;a:do try{if(Z!==0&&Y!==null){var s=Y,c=$u;switch(Z){case 8:zd(),o=6;break a;case 3:case 2:case 9:case 6:ko.current===null&&(t=!0);var l=Z;if(Z=0,$u=null,Qd(e,s,c,l),n&&td){o=0;break a}break;default:l=Z,Z=0,$u=null,Qd(e,s,c,l)}}qd(),o=id;break}catch(t){Vd(e,t)}while(1);return t&&e.shellSuspendCounter++,ga=ha=null,J=r,F.H=i,F.A=a,Y===null&&(Qu=null,X=0,Ci()),o}function qd(){for(;Y!==null;)Xd(Y)}function Jd(e,t){var n=J;J|=2;var r=Ud(),a=Wd();Qu!==e||X!==t?(gd=null,hd=ze()+500,Bd(e,t)):td=ot(e,t);a:do try{if(Z!==0&&Y!==null){t=Y;var o=$u;b:switch(Z){case 1:Z=0,$u=null,Qd(e,t,o,1);break;case 2:case 9:if(Qa(o)){Z=0,$u=null,Zd(t);break}t=function(){Z!==2&&Z!==9||Qu!==e||(Z=7),Ef(e)},o.then(t,t);break a;case 3:Z=7;break a;case 4:Z=5;break a;case 7:Qa(o)?(Z=0,$u=null,Zd(t)):(Z=0,$u=null,Qd(e,t,o,7));break;case 5:var s=null;switch(Y.tag){case 26:s=Y.memoizedState;case 5:case 27:var c=Y;if(s?Ym(s):c.stateNode.complete){Z=0,$u=null;var l=c.sibling;if(l!==null)Y=l;else{var u=c.return;u===null?Y=null:(Y=u,$d(u))}break b}}Z=0,$u=null,Qd(e,t,o,5);break;case 6:Z=0,$u=null,Qd(e,t,o,6);break;case 8:zd(),id=6;break a;default:throw Error(i(462))}}Yd();break}catch(t){Vd(e,t)}while(1);return ga=ha=null,F.H=r,F.A=a,J=n,Y===null?(Qu=null,X=0,Ci(),id):0}function Yd(){for(;Y!==null&&!Le();)Xd(Y)}function Xd(e){var t=ll(e.alternate,e,rd);e.memoizedProps=e.pendingProps,t===null?$d(e):Y=t}function Zd(e){var t=e,n=t.alternate;switch(t.tag){case 15:case 0:t=Wc(n,t,t.pendingProps,t.type,void 0,X);break;case 11:t=Wc(n,t,t.pendingProps,t.type.render,t.ref,X);break;case 5:ns(t);var r=t;r===na&&(V?(la(r),r.tag===5&&r.stateNode!=null&&(ra=r.stateNode)):(la(r),V=!0));default:vl(n,t),t=Y=Pi(t,rd),t=ll(n,t,rd)}e.memoizedProps=e.pendingProps,t===null?$d(e):Y=t}function Qd(e,t,n,r){ga=ha=null,ns(t),io=null,ao=0;var i=t.return;try{if(kc(e,i,t,n,X)){id=1,wc(e,Vi(n,e.current)),Y=null;return}}catch(t){if(i!==null)throw Y=i,t;id=1,wc(e,Vi(n,e.current)),Y=null;return}t.flags&32768?(V||r===1?e=!0:td||X&536870912?e=!1:(ed=e=!0,(r===2||r===9||r===3||r===6)&&(r=ko.current,r!==null&&r.tag===13&&(r.flags|=16384))),ef(t,e)):$d(t)}function $d(e){var t=e;do{if(t.flags&32768){ef(t,ed);return}e=t.return;var n=gl(t.alternate,t,rd);if(n!==null){Y=n;return}if(t=t.sibling,t!==null){Y=t;return}Y=t=e}while(t!==null);id===0&&(id=5)}function ef(e,t){do{var n=_l(e.alternate,e);if(n!==null){n.flags&=32767,Y=n;return}if(n=e.return,n!==null&&(n.flags|=32768,n.subtreeFlags=0,n.deletions=null),!t&&(e=e.sibling,e!==null)){Y=e;return}Y=e=n}while(e!==null);id=6,Y=null}function tf(e,t,n,r,a,o,s,c,l,u,d,f){e.cancelPendingCommit=null;do uf();while(vd!==0);if(J&6)throw Error(i(327));if(t!==null){if(t===e.current)throw Error(i(177));e===Qu&&(Y=Qu=null,X=0),bd=t,yd=e,xd=n,Cd=a,wd=r,nf(e,t,n,s,c,l,f)}}function nf(e,t,n,r,i,a,o){var s=t.lanes|t.childLanes;if(Sd=s,s|=Si,ft(e,n,s,r,i,a),Ed=null,(n&335544064)===n?(Dd=Fa(e),r=10262):(Dd=null,r=10256),(t.subtreeFlags&r)!==0||(t.flags&r)!==0?(e.callbackNode=null,e.callbackPriority=0,yf(Ue,function(){return df(),null})):(e.callbackNode=null,e.callbackPriority=0),Ll=!1,r=!!(t.flags&13878),t.subtreeFlags&13878||r){r=F.T,F.T=null,i=I.p,I.p=2,a=J,J|=4;try{du(e,t,n)}finally{J=a,I.p=i,F.T=r}}vd=1,Ll?Td=Mp(o,e.containerInfo,Dd,of,sf,af,cf,df,rf,null,null):(of(),sf(),cf())}function rf(e){if(vd!==0){var t=yd.onRecoverableError;t(e,{componentStack:null})}}function af(){vd===3&&(vd=0,Mu(bd,yd),vd=4)}function of(){if(vd===1){vd=0;var e=yd,t=bd,n=xd,r=!!(t.flags&13878);if(t.subtreeFlags&13878||r){r=F.T,F.T=null;var i=I.p;I.p=2;var a=J;J|=4;try{cu=lu=!1,Ou(t,e,n),n=cp;var o=Kr(e.containerInfo),s=n.focusedElem,c=n.selectionRange;if(o!==s&&s&&s.ownerDocument&&Gr(s.ownerDocument.documentElement,s)){if(c!==null&&qr(s)){var l=c.start,u=c.end;if(u===void 0&&(u=l),`selectionStart`in s)s.selectionStart=l,s.selectionEnd=Math.min(u,s.value.length);else{var d=s.ownerDocument||document,f=d&&d.defaultView||window;if(f.getSelection){var p=f.getSelection(),m=s.textContent.length,h=Math.min(c.start,m),g=c.end===void 0?h:Math.min(c.end,m);!p.extend&&h>g&&(o=g,g=h,h=o);var _=Wr(s,h),v=Wr(s,g);if(_&&v&&(p.rangeCount!==1||p.anchorNode!==_.node||p.anchorOffset!==_.offset||p.focusNode!==v.node||p.focusOffset!==v.offset)){var y=d.createRange();y.setStart(_.node,_.offset),p.removeAllRanges(),h>g?(p.addRange(y),p.extend(v.node,v.offset)):(y.setEnd(v.node,v.offset),p.addRange(y))}}}}for(d=[],p=s;p=p.parentNode;)p.nodeType===1&&d.push({element:p,left:p.scrollLeft,top:p.scrollTop});for(typeof s.focus==`function`&&s.focus(),s=0;s<d.length;s++){var b=d[s];b.element.scrollLeft=b.left,b.element.scrollTop=b.top}}gh=!!sp,cp=sp=null}finally{J=a,I.p=i,F.T=r}}e.current=t,vd=2}}function sf(){if(vd===2){vd=0;var e=yd,t=bd,n=!!(t.flags&8772);if(t.subtreeFlags&8772||n){n=F.T,F.T=null;var r=I.p;I.p=2;var i=J;J|=4;try{pu(e,t.alternate,t)}finally{J=i,I.p=r,F.T=n}}vd=3}}function cf(){if(vd===4||vd===3){vd=0;var e=Td;Td=null,Re();var t=yd,n=bd,r=xd,i=wd,a=(r&335544064)===r?10262:10256;if((n.subtreeFlags&a)!==0||(n.flags&a)!==0?vd=5:(vd=0,bd=yd=null,lf(t,t.pendingLanes)),a=t.pendingLanes,a===0&&(_d=null),_t(r),n=n.stateNode,Ye&&typeof Ye.onCommitFiberRoot==`function`)try{Ye.onCommitFiberRoot(Je,n,void 0,(n.current.flags&128)==128)}catch{}if(i!==null){n=F.T,a=I.p,I.p=2,F.T=null;try{for(var o=t.onRecoverableError,s=0;s<i.length;s++){var c=i[s];o(c.value,{componentStack:c.stack})}}finally{F.T=n,I.p=a}}if(i=Ed,o=Dd,Dd=null,i!==null&&(Ed=null,o===null&&(o=[]),e!==null))for(c=0;c<i.length;c++)n=(0,i[c])(o),n!==void 0&&e.finished.finally(n);xd&3&&uf(),Ef(t),a=t.pendingLanes,r&261930&&a&42?t===kd?Od++:(Od=0,kd=t):(Od=0,kd=null),Df(0,!1)}}function lf(e,t){(e.pooledCacheLanes&=t)===0&&(t=e.pooledCache,t!=null&&(e.pooledCache=null,Ma(t)))}function uf(){return Td!==null&&(Td.skipTransition(),Td=null),of(),sf(),cf(),df()}function df(){if(vd!==5)return!1;var e=yd,t=Sd;Sd=0;var n=_t(xd),r=F.T,a=I.p;try{I.p=32>n?32:n,F.T=null,n=Cd,Cd=null;var o=yd,s=xd;if(vd=0,bd=yd=null,xd=0,J&6)throw Error(i(331));var c=J;if(J|=4,qu(o.current),zu(o,o.current,s,n),J=c,Df(0,!1),Ye&&typeof Ye.onPostCommitFiberRoot==`function`)try{Ye.onPostCommitFiberRoot(Je,o)}catch{}return!0}finally{I.p=a,F.T=r,lf(e,t)}}function ff(e,t,n){t=Vi(n,t),t=Ec(e.stateNode,t,2),e=go(e,t,2),e!==null&&(dt(e,2),Ef(e))}function pf(e,t,n){if(e.tag===3)ff(e,e,n);else for(;t!==null;){if(t.tag===3){ff(t,e,n);break}if(t.tag===1){var r=t.stateNode;if(typeof t.type.getDerivedStateFromError==`function`||typeof r.componentDidCatch==`function`&&(_d===null||!_d.has(r))){e=Vi(n,e),n=Dc(2),r=go(t,n,2),r!==null&&(Oc(n,r,t,e),dt(r,2),Ef(r));break}}t=t.return}}function mf(e,t,n){var r=e.pingCache;if(r===null){r=e.pingCache=new Zu;var i=new Set;r.set(t,i)}else i=r.get(t),i===void 0&&(i=new Set,r.set(t,i));i.has(n)||(nd=!0,i.add(n),e=hf.bind(null,e,t,n),t.then(e,e))}function hf(e,t,n){var r=e.pingCache;r!==null&&r.delete(t),e.pingedLanes|=e.suspendedLanes&n,e.warmLanes&=~n,Qu===e&&(X&n)===n&&(id===4||id===3&&(X&62914560)===X&&300>ze()-pd?J&2?sd|=n:Bd(e,0):sd|=n,ld===X&&(ld=0)),Ef(e)}function gf(e,t){t===0&&(t=lt()),e=Ei(e,t),e!==null&&(dt(e,t),Ef(e))}function _f(e){var t=e.memoizedState,n=0;t!==null&&(n=t.retryLane),gf(e,n)}function vf(e,t){var n=0;switch(e.tag){case 31:case 13:var r=e.stateNode,a=e.memoizedState;a!==null&&(n=a.retryLane);break;case 19:r=e.stateNode;break;case 22:r=e.stateNode._retryCache;break;default:throw Error(i(314))}r!==null&&r.delete(t),gf(e,n)}function yf(e,t){return Fe(e,t)}var bf=null,xf=null,Sf=!1,Cf=!1,wf=!1,Tf=0;function Ef(e){e!==xf&&e.next===null&&(xf===null?bf=xf=e:xf=xf.next=e),Cf=!0,Sf||(Sf=!0,Nf())}function Df(e,t){if(!wf&&Cf){wf=!0;do for(var n=!1,r=bf;r!==null;){if(!t){if(e!==0){var i=r.pendingLanes;if(i===0)var a=0;else{var o=r.suspendedLanes,s=r.pingedLanes;a=(1<<31-Ze(42|e)+1)-1,a&=i&~(o&~s),a=a&201326741?a&201326741|1:a?a|2:0}a!==0&&(n=!0,Mf(r,a))}else a=X,a=at(r,r===Qu?a:0,r.cancelPendingCommit!==null||r.timeoutHandle!==-1),!(a&3)||ot(r,a)||(n=!0,Mf(r,a))}r=r.next}while(n);wf=!1}}function Of(){kf()}function kf(){Cf=Sf=!1;var e=0;Tf!==0&&hp()&&(e=Tf);for(var t=ze(),n=null,r=bf;r!==null;){var i=r.next,a=Af(r,t);a===0?(r.next=null,n===null?bf=i:n.next=i,i===null&&(xf=n)):(n=r,(e!==0||a&3)&&(Cf=!0)),r=i}vd!==0&&vd!==5||Df(e,!1),Tf!==0&&(Tf=0)}function Af(e,t){for(var n=e.suspendedLanes,r=e.pingedLanes,i=e.expirationTimes,a=e.pendingLanes&-62914561;0<a;){var o=31-Ze(a),s=1<<o,c=i[o];c===-1?((s&n)===0||(s&r)!==0)&&(i[o]=ct(s,t)):c<=t&&(e.expiredLanes|=s),a&=~s}if(t=Qu,n=X,n=at(e,e===t?n:0,e.cancelPendingCommit!==null||e.timeoutHandle!==-1),r=e.callbackNode,n===0||e===t&&(Z===2||Z===9)||e.cancelPendingCommit!==null)return r!==null&&r!==null&&Ie(r),e.callbackNode=null,e.callbackPriority=0;if(!(n&3)||ot(e,n)){if(t=n&-n,t===e.callbackPriority)return t;switch(r!==null&&Ie(r),_t(n)){case 2:case 8:n=He;break;case 32:n=Ue;break;case 268435456:n=Ge;break;default:n=Ue}return r=jf.bind(null,e),n=Fe(n,r),e.callbackPriority=t,e.callbackNode=n,t}return r!==null&&r!==null&&Ie(r),e.callbackPriority=2,e.callbackNode=null,2}function jf(e,t){if(vd!==0&&vd!==5)return e.callbackNode=null,e.callbackPriority=0,null;var n=e.callbackNode;if(uf()&&e.callbackNode!==n)return null;var r=X;return r=at(e,e===Qu?r:0,e.cancelPendingCommit!==null||e.timeoutHandle!==-1),r===0?null:(Pd(e,r,t),Af(e,ze()),e.callbackNode!=null&&e.callbackNode===n?jf.bind(null,e):null)}function Mf(e,t){if(uf())return null;Pd(e,t,!0)}function Nf(){bp(function(){J&6?Fe(Ve,Of):kf()})}function Pf(){if(Tf===0){var e=Ra;e===0&&(e=tt,tt<<=1,!(tt&261888)&&(tt=256)),Tf=e}return Tf}function Ff(e){return e==null||typeof e==`symbol`||typeof e==`boolean`?null:typeof e==`function`?e:gn(e)}function If(e,t,n,r,i){if(t===`submit`&&n&&n.stateNode===i){var a=Ff((i[St]||null).action),o=r.submitter;o&&(t=(t=o[St]||null)?Ff(t.formAction):o.getAttribute(`formAction`),t!==null&&(a=t,o=null));var s=new Rn(`action`,`action`,null,r,i);e.push({event:s,listeners:[{instance:null,listener:function(){if(r.defaultPrevented){if(Tf!==0){var e=new FormData(i,o);Qs(n,{pending:!0,data:e,method:i.method,action:a},null,e)}}else typeof a==`function`&&(s.preventDefault(),e=new FormData(i,o),Qs(n,{pending:!0,data:e,method:i.method,action:a},a,e))},currentTarget:i}]})}}for(var Lf=0;Lf<pi.length;Lf++){var Rf=pi[Lf];mi(Rf.toLowerCase(),`on`+(Rf[0].toUpperCase()+Rf.slice(1)))}mi(ai,`onAnimationEnd`),mi(oi,`onAnimationIteration`),mi(si,`onAnimationStart`),mi(`dblclick`,`onDoubleClick`),mi(`focusin`,`onFocus`),mi(`focusout`,`onBlur`),mi(ci,`onTransitionRun`),mi(li,`onTransitionStart`),mi(ui,`onTransitionCancel`),mi(di,`onTransitionEnd`),Bt(`onMouseEnter`,[`mouseout`,`mouseover`]),Bt(`onMouseLeave`,[`mouseout`,`mouseover`]),Bt(`onPointerEnter`,[`pointerout`,`pointerover`]),Bt(`onPointerLeave`,[`pointerout`,`pointerover`]),zt(`onChange`,`change click focusin focusout input keydown keyup selectionchange`.split(` `)),zt(`onSelect`,`focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange`.split(` `)),zt(`onBeforeInput`,[`compositionend`,`keypress`,`textInput`,`paste`]),zt(`onCompositionEnd`,`compositionend focusout keydown keypress keyup mousedown`.split(` `)),zt(`onCompositionStart`,`compositionstart focusout keydown keypress keyup mousedown`.split(` `)),zt(`onCompositionUpdate`,`compositionupdate focusout keydown keypress keyup mousedown`.split(` `));var zf=`abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting`.split(` `),Bf=new Set(`beforetoggle cancel close invalid load scroll scrollend toggle`.split(` `).concat(zf));function Vf(e,t){t=!!(t&4);for(var n=0;n<e.length;n++){var r=e[n],i=r.event;r=r.listeners;a:{var a=void 0;if(t)for(var o=r.length-1;0<=o;o--){var s=r[o],c=s.instance,l=s.currentTarget;if(s=s.listener,c!==a&&i.isPropagationStopped())break a;a=s,i.currentTarget=l;try{a(i)}catch(e){yi(e)}i.currentTarget=null,a=c}else for(o=0;o<r.length;o++){if(s=r[o],c=s.instance,l=s.currentTarget,s=s.listener,c!==a&&i.isPropagationStopped())break a;a=s,i.currentTarget=l;try{a(i)}catch(e){yi(e)}i.currentTarget=null,a=c}}}}function Q(e,t){var n=t[wt];n===void 0&&(n=t[wt]=new Set);var r=e+`__bubble`;n.has(r)||(Gf(t,e,2,!1),n.add(r))}function Hf(e,t,n){var r=0;t&&(r|=4),Gf(n,e,r,t)}var Uf=`_reactListening`+Math.random().toString(36).slice(2);function Wf(e){if(!e[Uf]){e[Uf]=!0,Lt.forEach(function(t){t!==`selectionchange`&&(Bf.has(t)||Hf(t,!1,e),Hf(t,!0,e))});var t=e.nodeType===9?e:e.ownerDocument;t===null||t[Uf]||(t[Uf]=!0,Hf(`selectionchange`,!1,t))}}function Gf(e,t,n,r){switch(Ch(t)){case 2:var i=_h;break;case 8:i=vh;break;default:i=yh}n=i.bind(null,t,n,e),i=void 0,!Dn||t!==`touchstart`&&t!==`touchmove`&&t!==`wheel`||(i=!0),r?i===void 0?e.addEventListener(t,n,!0):e.addEventListener(t,n,{capture:!0,passive:i}):i===void 0?e.addEventListener(t,n,!1):e.addEventListener(t,n,{passive:i})}function Kf(e,t,n,r,i){var a=r;if(!(t&1)&&!(t&2)&&r!==null)a:for(;;){if(r===null)return;var s=r.tag;if(s===3||s===4){var c=r.stateNode.containerInfo;if(c===i)break;if(s===4)for(s=r.return;s!==null;){var l=s.tag;if((l===3||l===4)&&s.stateNode.containerInfo===i)return;s=s.return}for(;c!==null;){if(s=jt(c),s===null)return;if(l=s.tag,l===5||l===6||l===26||l===27){r=a=s;continue a}c=c.parentNode}}r=r.return}wn(function(){var r=a,i=yn(n),s=[];a:{var c=fi.get(e);if(c!==void 0){var l=Rn,u=e;switch(e){case`keypress`:if(Nn(n)===0)break a;case`keydown`:case`keyup`:l=nr;break;case`focusin`:u=`focus`,l=qn;break;case`focusout`:u=`blur`,l=qn;break;case`beforeblur`:case`afterblur`:l=qn;break;case`click`:if(n.button===2)break a;case`auxclick`:case`dblclick`:case`mousedown`:case`mousemove`:case`mouseup`:case`mouseout`:case`mouseover`:case`contextmenu`:l=Gn;break;case`drag`:case`dragend`:case`dragenter`:case`dragexit`:case`dragleave`:case`dragover`:case`dragstart`:case`drop`:l=Kn;break;case`touchcancel`:case`touchend`:case`touchmove`:case`touchstart`:l=ar;break;case ai:case oi:case si:l=Jn;break;case di:l=or;break;case`scroll`:case`scrollend`:l=Bn;break;case`wheel`:l=sr;break;case`copy`:case`cut`:case`paste`:l=Yn;break;case`gotpointercapture`:case`lostpointercapture`:case`pointercancel`:case`pointerdown`:case`pointermove`:case`pointerout`:case`pointerover`:case`pointerup`:l=rr;break;case`submit`:l=ir;break;case`toggle`:case`beforetoggle`:l=cr}var d=!!(t&4),f=!d&&(e===`scroll`||e===`scrollend`),p=d?c===null?null:c+`Capture`:c;d=[];for(var m=r,h;m!==null;){var g=m;if(h=g.stateNode,g=g.tag,g!==5&&g!==26&&g!==27||h===null||p===null||(g=Tn(m,p),g!=null&&d.push(qf(m,g,h))),f)break;m=m.return}0<d.length&&(c=new l(c,u,null,n,i),s.push({event:c,listeners:d}))}}if(!(t&7)){a:{if(l=e===`mouseover`||e===`pointerover`,c=e===`mouseout`||e===`pointerout`,l&&n!==vn&&(u=n.relatedTarget||n.fromElement)&&(jt(u)||u[Ct]))break a;(c||l)&&(u=i.window===i?i:(l=i.ownerDocument)?l.defaultView||l.parentWindow:window,c?(l=n.relatedTarget||n.toElement,c=r,l=l?jt(l):null,l!==null&&(f=o(l),d=l.tag,l!==f||d!==5&&d!==27&&d!==6)&&(l=null)):(c=null,l=r),c!==l&&(d=Gn,g=`onMouseLeave`,p=`onMouseEnter`,m=`mouse`,(e===`pointerout`||e===`pointerover`)&&(d=rr,g=`onPointerLeave`,p=`onPointerEnter`,m=`pointer`),f=c==null?u:Nt(c),h=l==null?u:Nt(l),u=new d(g,m+`leave`,c,n,i),u.target=f,u.relatedTarget=h,g=null,jt(i)===r&&(d=new d(p,m+`enter`,l,n,i),d.target=h,d.relatedTarget=f,g=d),f=g,d=c&&l?E(c,l,Yf):null,c!==null&&Xf(s,u,c,d,!1),l!==null&&f!==null&&Xf(s,f,l,d,!0)))}a:{if(c=r?Nt(r):window,l=c.nodeName&&c.nodeName.toLowerCase(),l===`select`||l===`input`&&c.type===`file`)var _=Or;else if(Sr(c)){if(kr)_=Rr;else{_=Ir;var v=Fr}}else l=c.nodeName,!l||l.toLowerCase()!==`input`||c.type!==`checkbox`&&c.type!==`radio`?r&&pn(r.elementType)&&(_=Or):_=Lr;if(_&&=_(e,r)){Cr(s,_,n,i);break a}v&&v(e,c,r)}switch(v=r?Nt(r):window,e){case`focusin`:(Sr(v)||v.contentEditable===`true`)&&(Yr=v,Xr=r,Zr=null);break;case`focusout`:Zr=Xr=Yr=null;break;case`mousedown`:Qr=!0;break;case`contextmenu`:case`mouseup`:case`dragend`:Qr=!1,$r(s,n,i);break;case`selectionchange`:if(Jr)break;case`keydown`:case`keyup`:$r(s,n,i)}var y;if(ur)b:{switch(e){case`compositionstart`:var b=`onCompositionStart`;break b;case`compositionend`:b=`onCompositionEnd`;break b;case`compositionupdate`:b=`onCompositionUpdate`;break b}b=void 0}else vr?gr(e,n)&&(b=`onCompositionEnd`):e===`keydown`&&n.keyCode===229&&(b=`onCompositionStart`);b&&(pr&&n.locale!==`ko`&&(vr||b!==`onCompositionStart`?b===`onCompositionEnd`&&vr&&(y=Mn()):(kn=i,An=`value`in kn?kn.value:kn.textContent,vr=!0)),v=Jf(r,b),0<v.length&&(b=new Xn(b,e,null,n,i),s.push({event:b,listeners:v}),y?b.data=y:(y=_r(n),y!==null&&(b.data=y)))),(y=fr?yr(e,n):br(e,n))&&(b=Jf(r,`onBeforeInput`),0<b.length&&(v=new Xn(`onBeforeInput`,`beforeinput`,null,n,i),s.push({event:v,listeners:b}),v.data=y)),If(s,e,r,n,i)}Vf(s,t)})}function qf(e,t,n){return{instance:e,listener:t,currentTarget:n}}function Jf(e,t){for(var n=t+`Capture`,r=[];e!==null;){var i=e,a=i.stateNode;if(i=i.tag,i!==5&&i!==26&&i!==27||a===null||(i=Tn(e,n),i!=null&&r.unshift(qf(e,i,a)),i=Tn(e,t),i!=null&&r.push(qf(e,i,a))),e.tag===3)return r;e=e.return}return[]}function Yf(e){if(e===null)return null;do e=e.return;while(e&&e.tag!==5&&e.tag!==27);return e||null}function Xf(e,t,n,r,i){for(var a=t._reactName,o=[];n!==null&&n!==r;){var s=n,c=s.alternate,l=s.stateNode;if(s=s.tag,c!==null&&c===r)break;s!==5&&s!==26&&s!==27||l===null||(c=l,i?(l=Tn(n,a),l!=null&&o.unshift(qf(n,l,c))):i||(l=Tn(n,a),l!=null&&o.push(qf(n,l,c)))),n=n.return}o.length!==0&&e.push({event:t,listeners:o})}var Zf=/\\r\\n?/g,Qf=/\\u0000|\\uFFFD/g;function $f(e){return(typeof e==`string`?e:``+e).replace(Zf,`\n`).replace(Qf,``)}function ep(e,t){return t=$f(t),$f(e)===t}function $(e,t,n,r,a,o){switch(n){case`children`:if(typeof r==`string`)t===`body`||t===`textarea`&&r===``||ln(e,r);else if(typeof r==`number`||typeof r==`bigint`)t!==`body`&&ln(e,``+r);else return;break;case`className`:qt(e,`class`,r);break;case`tabIndex`:qt(e,`tabindex`,r);break;case`dir`:case`role`:case`viewBox`:case`width`:case`height`:qt(e,n,r);break;case`style`:fn(e,r,o);return;case`data`:if(t!==`object`){qt(e,`data`,r);break}case`src`:case`href`:if(r===``&&(t!==`a`||n!==`href`)||r==null||typeof r==`function`||typeof r==`symbol`||typeof r==`boolean`){e.removeAttribute(n);break}r=gn(r),e.setAttribute(n,r);break;case`action`:case`formAction`:if(typeof r==`function`){e.setAttribute(n,`javascript:throw new Error(\'A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\\\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().\')`);break}if(typeof o==`function`&&(n===`formAction`?(t!==`input`&&$(e,t,`name`,a.name,a,null),$(e,t,`formEncType`,a.formEncType,a,null),$(e,t,`formMethod`,a.formMethod,a,null),$(e,t,`formTarget`,a.formTarget,a,null)):($(e,t,`encType`,a.encType,a,null),$(e,t,`method`,a.method,a,null),$(e,t,`target`,a.target,a,null))),r==null||typeof r==`symbol`||typeof r==`boolean`){e.removeAttribute(n);break}r=gn(r),e.setAttribute(n,r);break;case`onClick`:r!=null&&(e.onclick=_n);return;case`onScroll`:r!=null&&Q(`scroll`,e);return;case`onScrollEnd`:r!=null&&Q(`scrollend`,e);return;case`dangerouslySetInnerHTML`:if(r!=null){if(typeof r!=`object`||!(`__html`in r))throw Error(i(61));if(n=r.__html,n!=null){if(a.children!=null)throw Error(i(60));o?.__html!==n&&(e.innerHTML=n)}}break;case`multiple`:e.multiple=r&&typeof r!=`function`&&typeof r!=`symbol`;break;case`muted`:e.muted=r&&typeof r!=`function`&&typeof r!=`symbol`;break;case`suppressContentEditableWarning`:case`suppressHydrationWarning`:case`defaultValue`:case`defaultChecked`:case`innerHTML`:case`ref`:break;case`autoFocus`:break;case`xlinkHref`:if(r==null||typeof r==`function`||typeof r==`boolean`||typeof r==`symbol`){e.removeAttribute(`xlink:href`);break}n=gn(r),e.setAttributeNS(`http://www.w3.org/1999/xlink`,`xlink:href`,n);break;case`contentEditable`:case`spellCheck`:case`draggable`:case`value`:case`autoReverse`:case`externalResourcesRequired`:case`focusable`:case`preserveAlpha`:r!=null&&typeof r!=`function`&&typeof r!=`symbol`?e.setAttribute(n,r):e.removeAttribute(n);break;case`inert`:case`allowFullScreen`:case`async`:case`autoPlay`:case`controls`:case`credentialless`:case`default`:case`defer`:case`disabled`:case`disablePictureInPicture`:case`disableRemotePlayback`:case`formNoValidate`:case`hidden`:case`loop`:case`noModule`:case`noValidate`:case`open`:case`playsInline`:case`readOnly`:case`required`:case`reversed`:case`scoped`:case`seamless`:case`itemScope`:r&&typeof r!=`function`&&typeof r!=`symbol`?e.setAttribute(n,``):e.removeAttribute(n);break;case`capture`:case`download`:!0===r?e.setAttribute(n,``):!1!==r&&r!=null&&typeof r!=`function`&&typeof r!=`symbol`?e.setAttribute(n,r):e.removeAttribute(n);break;case`cols`:case`rows`:case`size`:case`span`:r!=null&&typeof r!=`function`&&typeof r!=`symbol`&&!isNaN(r)&&1<=r?e.setAttribute(n,r):e.removeAttribute(n);break;case`rowSpan`:case`start`:r==null||typeof r==`function`||typeof r==`symbol`||isNaN(r)?e.removeAttribute(n):e.setAttribute(n,r);break;case`popover`:Q(`beforetoggle`,e),Q(`toggle`,e),Kt(e,`popover`,r);break;case`xlinkActuate`:Jt(e,`http://www.w3.org/1999/xlink`,`xlink:actuate`,r);break;case`xlinkArcrole`:Jt(e,`http://www.w3.org/1999/xlink`,`xlink:arcrole`,r);break;case`xlinkRole`:Jt(e,`http://www.w3.org/1999/xlink`,`xlink:role`,r);break;case`xlinkShow`:Jt(e,`http://www.w3.org/1999/xlink`,`xlink:show`,r);break;case`xlinkTitle`:Jt(e,`http://www.w3.org/1999/xlink`,`xlink:title`,r);break;case`xlinkType`:Jt(e,`http://www.w3.org/1999/xlink`,`xlink:type`,r);break;case`xmlBase`:Jt(e,`http://www.w3.org/XML/1998/namespace`,`xml:base`,r);break;case`xmlLang`:Jt(e,`http://www.w3.org/XML/1998/namespace`,`xml:lang`,r);break;case`xmlSpace`:Jt(e,`http://www.w3.org/XML/1998/namespace`,`xml:space`,r);break;case`is`:Kt(e,`is`,r);break;case`innerText`:case`textContent`:return;default:if(!(2<n.length)||n[0]!==`o`&&n[0]!==`O`||n[1]!==`n`&&n[1]!==`N`)n=mn.get(n)||n,Kt(e,n,r);else return}B=!0}function tp(e,t,n,r,a,o){switch(n){case`style`:fn(e,r,o);return;case`dangerouslySetInnerHTML`:if(r!=null){if(typeof r!=`object`||!(`__html`in r))throw Error(i(61));if(n=r.__html,n!=null){if(a.children!=null)throw Error(i(60));o?.__html!==n&&(e.innerHTML=n)}}break;case`children`:if(typeof r==`string`)ln(e,r);else if(typeof r==`number`||typeof r==`bigint`)ln(e,``+r);else return;break;case`onScroll`:r!=null&&Q(`scroll`,e);return;case`onScrollEnd`:r!=null&&Q(`scrollend`,e);return;case`onClick`:r!=null&&(e.onclick=_n);return;case`suppressContentEditableWarning`:case`suppressHydrationWarning`:case`innerHTML`:case`ref`:return;case`innerText`:case`textContent`:return;default:if(!Rt.hasOwnProperty(n))a:{if(n[0]===`o`&&n[1]===`n`&&(a=n.endsWith(`Capture`),o=n.slice(2,a?n.length-7:void 0),t=e[St]||null,t=t==null?null:t[n],typeof t==`function`&&e.removeEventListener(o,t,a),typeof r==`function`)){typeof t!=`function`&&t!==null&&(n in e?e[n]=null:e.hasAttribute(n)&&e.removeAttribute(n)),e.addEventListener(o,r,a);break a}B=!0,n in e?e[n]=r:!0===r?e.setAttribute(n,``):Kt(e,n,r)}return}B=!0}function np(e,t,n){switch(t){case`div`:case`span`:case`svg`:case`path`:case`a`:case`g`:case`p`:case`li`:break;case`img`:Q(`error`,e),Q(`load`,e);var r=!1,a=!1,o;for(o in n)if(n.hasOwnProperty(o)){var s=n[o];if(s!=null)switch(o){case`src`:r=!0;break;case`srcSet`:a=!0;break;case`children`:case`dangerouslySetInnerHTML`:throw Error(i(137,t));default:$(e,t,o,s,n,null)}}a&&$(e,t,`srcSet`,n.srcSet,n,null),r&&$(e,t,`src`,n.src,n,null);return;case`input`:Q(`invalid`,e);var c=o=s=a=null,l=null,u=null;for(r in n)if(n.hasOwnProperty(r)){var d=n[r];if(d!=null)switch(r){case`name`:a=d;break;case`type`:s=d;break;case`checked`:l=d;break;case`defaultChecked`:u=d;break;case`value`:o=d;break;case`defaultValue`:c=d;break;case`children`:case`dangerouslySetInnerHTML`:if(d!=null)throw Error(i(137,t));break;default:$(e,t,r,d,n,null)}}rn(e,o,c,l,u,s,a,!1);return;case`select`:for(a in Q(`invalid`,e),r=s=o=null,n)if(n.hasOwnProperty(a)&&(c=n[a],c!=null))switch(a){case`value`:o=c;break;case`defaultValue`:s=c;break;case`multiple`:r=c;default:$(e,t,a,c,n,null)}t=o,n=s,e.multiple=!!r,t==null?n!=null&&on(e,!!r,n,!0):on(e,!!r,t,!1);return;case`textarea`:for(s in Q(`invalid`,e),o=a=r=null,n)if(n.hasOwnProperty(s)&&(c=n[s],c!=null))switch(s){case`value`:r=c;break;case`defaultValue`:a=c;break;case`children`:o=c;break;case`dangerouslySetInnerHTML`:if(c!=null)throw Error(i(91));break;default:$(e,t,s,c,n,null)}cn(e,r,a,o);return;case`option`:for(l in n)if(n.hasOwnProperty(l)&&(r=n[l],r!=null))switch(l){case`selected`:e.selected=r&&typeof r!=`function`&&typeof r!=`symbol`;break;default:$(e,t,l,r,n,null)}return;case`dialog`:Q(`beforetoggle`,e),Q(`toggle`,e),Q(`cancel`,e),Q(`close`,e);break;case`iframe`:case`object`:Q(`load`,e);break;case`video`:case`audio`:for(r=0;r<zf.length;r++)Q(zf[r],e);break;case`image`:Q(`error`,e),Q(`load`,e);break;case`details`:Q(`toggle`,e);break;case`embed`:case`source`:case`link`:Q(`error`,e),Q(`load`,e);case`area`:case`base`:case`br`:case`col`:case`hr`:case`keygen`:case`meta`:case`param`:case`track`:case`wbr`:case`menuitem`:for(u in n)if(n.hasOwnProperty(u)&&(r=n[u],r!=null))switch(u){case`children`:case`dangerouslySetInnerHTML`:throw Error(i(137,t));default:$(e,t,u,r,n,null)}return;default:if(pn(t)){for(d in n)n.hasOwnProperty(d)&&(r=n[d],r!==void 0&&tp(e,t,d,r,n,void 0));return}}for(c in n)n.hasOwnProperty(c)&&(r=n[c],r!=null&&$(e,t,c,r,n,null))}var rp={};function ip(e,t,n,r){switch(t){case`div`:case`span`:case`svg`:case`path`:case`a`:case`g`:case`p`:case`li`:break;case`input`:var a=null,o=null,s=null,c=null,l=null,u=null,d=null;for(m in n){var f=n[m];if(n.hasOwnProperty(m)&&f!=null)switch(m){case`checked`:break;case`value`:break;case`defaultValue`:l=f;default:r.hasOwnProperty(m)||$(e,t,m,null,r,f)}}for(var p in r){var m=r[p];if(f=n[p],r.hasOwnProperty(p)&&(m!=null||f!=null))switch(p){case`type`:m!==f&&(B=!0),o=m;break;case`name`:m!==f&&(B=!0),a=m;break;case`checked`:m!==f&&(B=!0),u=m;break;case`defaultChecked`:m!==f&&(B=!0),d=m;break;case`value`:m!==f&&(B=!0),s=m;break;case`defaultValue`:m!==f&&(B=!0),c=m;break;case`children`:case`dangerouslySetInnerHTML`:if(m!=null)throw Error(i(137,t));break;default:m!==f&&$(e,t,p,m,r,f)}}nn(e,s,c,l,u,d,o,a);return;case`select`:for(o in m=s=c=p=null,n)if(l=n[o],n.hasOwnProperty(o)&&l!=null)switch(o){case`value`:break;case`multiple`:m=l;default:r.hasOwnProperty(o)||$(e,t,o,null,r,l)}for(a in r)if(o=r[a],l=n[a],r.hasOwnProperty(a)&&(o!=null||l!=null))switch(a){case`value`:o!==l&&(B=!0),p=o;break;case`defaultValue`:o!==l&&(B=!0),c=o;break;case`multiple`:o!==l&&(B=!0),s=o;default:o!==l&&$(e,t,a,o,r,l)}t=c,n=s,r=m,p==null?!!r!=!!n&&(t==null?on(e,!!n,n?[]:``,!1):on(e,!!n,t,!0)):on(e,!!n,p,!1);return;case`textarea`:for(c in m=p=null,n)if(a=n[c],n.hasOwnProperty(c)&&a!=null&&!r.hasOwnProperty(c))switch(c){case`value`:break;case`children`:break;default:$(e,t,c,null,r,a)}for(s in r)if(a=r[s],o=n[s],r.hasOwnProperty(s)&&(a!=null||o!=null))switch(s){case`value`:a!==o&&(B=!0),p=a;break;case`defaultValue`:a!==o&&(B=!0),m=a;break;case`children`:break;case`dangerouslySetInnerHTML`:if(a!=null)throw Error(i(91));break;default:a!==o&&$(e,t,s,a,r,o)}sn(e,p,m);return;case`option`:for(var h in n)if(p=n[h],n.hasOwnProperty(h)&&p!=null&&!r.hasOwnProperty(h))switch(h){case`selected`:e.selected=!1;break;default:$(e,t,h,null,r,p)}for(l in r)if(p=r[l],m=n[l],r.hasOwnProperty(l)&&p!==m&&(p!=null||m!=null))switch(l){case`selected`:p!==m&&(B=!0),e.selected=p&&typeof p!=`function`&&typeof p!=`symbol`;break;default:$(e,t,l,p,r,m)}return;case`img`:case`link`:case`area`:case`base`:case`br`:case`col`:case`embed`:case`hr`:case`keygen`:case`meta`:case`param`:case`source`:case`track`:case`wbr`:case`menuitem`:for(var g in n)p=n[g],n.hasOwnProperty(g)&&p!=null&&!r.hasOwnProperty(g)&&$(e,t,g,null,r,p);for(u in r)if(p=r[u],m=n[u],r.hasOwnProperty(u)&&p!==m&&(p!=null||m!=null))switch(u){case`children`:case`dangerouslySetInnerHTML`:if(p!=null)throw Error(i(137,t));break;default:$(e,t,u,p,r,m)}return;default:if(pn(t)){for(var _ in n)p=n[_],n.hasOwnProperty(_)&&p!==void 0&&!r.hasOwnProperty(_)&&tp(e,t,_,void 0,r,p);for(d in r)p=r[d],m=n[d],!r.hasOwnProperty(d)||p===m||p===void 0&&m===void 0||tp(e,t,d,p,r,m);return}}for(var v in n)p=n[v],n.hasOwnProperty(v)&&p!=null&&!r.hasOwnProperty(v)&&$(e,t,v,null,r,p);for(f in r)p=r[f],m=n[f],!r.hasOwnProperty(f)||p===m||p==null&&m==null||$(e,t,f,p,r,m)}function ap(e){switch(e){case`css`:case`script`:case`font`:case`img`:case`image`:case`input`:case`link`:return!0;default:return!1}}function op(){if(typeof performance.getEntriesByType==`function`){for(var e=0,t=0,n=performance.getEntriesByType(`resource`),r=0;r<n.length;r++){var i=n[r],a=i.transferSize,o=i.initiatorType,s=i.duration;if(a&&s&&ap(o)){for(o=0,s=i.responseEnd,r+=1;r<n.length;r++){var c=n[r],l=c.startTime;if(l>s)break;var u=c.transferSize,d=c.initiatorType;u&&ap(d)&&(c=c.responseEnd,o+=u*(c<s?1:(s-l)/(c-l)))}if(--r,t+=8*(a+o)/(i.duration/1e3),e++,10<e)break}}if(0<e)return t/e/1e6}return navigator.connection&&(e=navigator.connection.downlink,typeof e==`number`)?e:5}var sp=null,cp=null;function lp(e){return e.nodeType===9?e:e.ownerDocument}function up(e){switch(e){case`http://www.w3.org/2000/svg`:return 1;case`http://www.w3.org/1998/Math/MathML`:return 2;default:return 0}}function dp(e,t){if(e===0)switch(t){case`svg`:return 1;case`math`:return 2;default:return 0}return e===1&&t===`foreignObject`?0:e}function fp(e,t,n,r){return n=lp(n).createElement(e),n[xt]=r,n[St]=t,np(n,e,t),Ft(n),n}function pp(e,t){return e===`textarea`||e===`noscript`||typeof t.children==`string`||typeof t.children==`number`||typeof t.children==`bigint`||typeof t.dangerouslySetInnerHTML==`object`&&t.dangerouslySetInnerHTML!==null&&t.dangerouslySetInnerHTML.__html!=null}var mp=null;function hp(){var e=window.event;return e&&e.type===`popstate`?e!==mp&&(mp=e,!0):(mp=null,!1)}var gp=typeof setTimeout==`function`?setTimeout:void 0,_p=typeof clearTimeout==`function`?clearTimeout:void 0,vp=typeof Promise==`function`?Promise:void 0,yp=typeof requestAnimationFrame==`function`?requestAnimationFrame:gp,bp=typeof queueMicrotask==`function`?queueMicrotask:vp===void 0?gp:function(e){return vp.resolve(null).then(e).catch(xp)};function xp(e){setTimeout(function(){throw e})}function Sp(e){return e===`head`}function Cp(e,t){var n=t,r=0;do{var i=n.nextSibling;if(e.removeChild(n),i&&i.nodeType===8){if(n=i.data,n===`/$`||n===`/&`){if(r===0){e.removeChild(i),Hh(t);return}r--}else if(n===`$`||n===`$?`||n===`$~`||n===`$!`||n===`&`)r++;else if(n===`html`)_m(e.ownerDocument.documentElement);else if(n===`head`){n=e.ownerDocument.head,_m(n);for(var a=n.firstChild;a;){var o=a.nextSibling,s=a.nodeName;a[Ot]||s===`SCRIPT`||s===`STYLE`||s===`LINK`&&a.rel.toLowerCase()===`stylesheet`||n.removeChild(a),a=o}}else n===`body`&&_m(e.ownerDocument.body)}n=i}while(n);Hh(t)}function wp(e,t){var n=e;e=0;do{var r=n.nextSibling;if(n.nodeType===1?t?(n._stashedDisplay=n.style.display,n.style.display=`none`):(n.style.display=n._stashedDisplay||``,n.getAttribute(`style`)===``&&n.removeAttribute(`style`)):n.nodeType===3&&(t?(n._stashedText=n.nodeValue,n.nodeValue=``):n.nodeValue=n._stashedText||``),r&&r.nodeType===8){if(n=r.data,n===`/$`){if(e===0)break;e--}else n!==`$`&&n!==`$?`&&n!==`$~`&&n!==`$!`||e++}n=r}while(n)}function Tp(e,t,n){if(t=CSS.escape(t)===t?t:`r-`+btoa(t).replace(/=/g,``),e.style.viewTransitionName=t,n!=null&&(e.style.viewTransitionClass=n),n=getComputedStyle(e),n.display===`inline`){if(t=e.getClientRects(),t.length===1)var r=1;else for(var i=r=0;i<t.length;i++){var a=t[i];0<a.width&&0<a.height&&r++}r===1&&(e=e.style,e.display=t.length===1?`inline-block`:`block`,e.marginTop=`-`+n.paddingTop,e.marginBottom=`-`+n.paddingBottom)}}function Ep(e,t){e=e.style,t=t.style;var n=t==null?null:t.hasOwnProperty(`viewTransitionName`)?t.viewTransitionName:t.hasOwnProperty(`view-transition-name`)?t[`view-transition-name`]:null;e.viewTransitionName=n==null||typeof n==`boolean`?``:(``+n).trim(),n=t==null?null:t.hasOwnProperty(`viewTransitionClass`)?t.viewTransitionClass:t.hasOwnProperty(`view-transition-class`)?t[`view-transition-class`]:null,e.viewTransitionClass=n==null||typeof n==`boolean`?``:(``+n).trim(),e.display===`inline-block`&&(t==null?e.display=e.margin=``:(n=t.display,e.display=n==null||typeof n==`boolean`?``:n,n=t.margin,n==null?(n=t.hasOwnProperty(`marginTop`)?t.marginTop:t[`margin-top`],e.marginTop=n==null||typeof n==`boolean`?``:n,t=t.hasOwnProperty(`marginBottom`)?t.marginBottom:t[`margin-bottom`],e.marginBottom=t==null||typeof t==`boolean`?``:t):e.margin=n))}function Dp(e,t,n){return n=n.ownerDocument.defaultView,{rect:e,abs:t.position===`absolute`||t.position===`fixed`,clip:t.clipPath!==`none`||t.overflow!==`visible`||t.filter!==`none`||t.mask!==`none`||t.mask!==`none`||t.borderRadius!==`0px`,view:0<=e.bottom&&0<=e.right&&e.top<=n.innerHeight&&e.left<=n.innerWidth}}function Op(e){return Dp(e.getBoundingClientRect(),getComputedStyle(e),e)}function kp(e){var t=e.getBoundingClientRect();t=new DOMRect(t.x+2e4,t.y+2e4,t.width,t.height);var n=getComputedStyle(e);return Dp(t,n,e)}function Ap(e){return e.documentElement.clientHeight}function jp(e){this.addEventListener(`load`,e),this.addEventListener(`error`,e)}function Mp(e,t,n,r,i,a,o,s,c){var l=t.nodeType===9?t:t.ownerDocument;try{var u=l.startViewTransition({update:function(){var t=l.defaultView,n=t.navigation&&t.navigation.transition,o=l.fonts.status;r();var s=[];if(o===`loaded`&&(Ap(l),l.fonts.status===`loading`&&s.push(l.fonts.ready)),o=s.length,e!==null)for(var c=e.suspenseyImages,u=0,d=0;d<c.length;d++){var f=c[d];if(!f.complete){var p=f.getBoundingClientRect();if(0<p.bottom&&0<p.right&&p.top<t.innerHeight&&p.left<t.innerWidth){if(u+=Xm(f),u>$m){s.length=o;break}f=new Promise(jp.bind(f)),s.push(f)}}}if(0<s.length)return t=Promise.race([Promise.all(s),new Promise(function(e){return setTimeout(e,500)})]).then(i,i),(n?Promise.allSettled([n.finished,t]):t).then(a,a);if(i(),n)return n.finished.then(a,a);a()},types:n});l.__reactViewTransition=u;var d=[];return u.ready.then(function(){for(var e=l.documentElement.getAnimations({subtree:!0}),t=0;t<e.length;t++){var n=e[t],r=n.effect,i=r.pseudoElement;if(i!=null&&i.startsWith(`::view-transition`)){d.push(n),n=r.getKeyframes();for(var a=i=void 0,s=!0,c=0;c<n.length;c++){var u=n[c],f=u.width;if(i===void 0)i=f;else if(i!==f){s=!1;break}if(f=u.height,a===void 0)a=f;else if(a!==f){s=!1;break}delete u.width,delete u.height,u.transform===`none`&&delete u.transform}s&&i!==void 0&&a!==void 0&&(r.setKeyframes(n),s=getComputedStyle(r.target,r.pseudoElement),s.width!==i||s.height!==a)&&(s=n[0],s.width=i,s.height=a,s=n[n.length-1],s.width=i,s.height=a,r.setKeyframes(n))}}o()},function(e){l.__reactViewTransition===u&&(l.__reactViewTransition=null);try{if(typeof e==`object`&&e)switch(e.name){case`InvalidStateError`:(e.message===`View transition was skipped because document visibility state is hidden.`||e.message===`Skipping view transition because document visibility state has become hidden.`||e.message===`Skipping view transition because viewport size changed.`||e.message===`Transition was aborted because of invalid state`)&&(e=null)}e!==null&&c(e)}finally{r(),i(),o()}}),u.finished.finally(function(){for(var e=0;e<d.length;e++)d[e].cancel();l.__reactViewTransition===u&&(l.__reactViewTransition=null),s()}),u}catch{return r(),i(),o(),null}}function Np(e,t){this._scope=document.documentElement,this._selector=`::view-transition-`+e+`(`+t+`)`}Np.prototype.animate=function(e,t){return t=typeof t==`number`?{duration:t}:D({},t),t.pseudoElement=this._selector,this._scope.animate(e,t)},Np.prototype.getAnimations=function(){for(var e=this._scope,t=this._selector,n=e.getAnimations({subtree:!0}),r=[],i=0;i<n.length;i++){var a=n[i].effect;a!==null&&a.target===e&&a.pseudoElement===t&&r.push(n[i])}return r},Np.prototype.getComputedStyle=function(){return getComputedStyle(this._scope,this._selector)};function Pp(e){return{name:e,group:new Np(`group`,e),imagePair:new Np(`image-pair`,e),old:new Np(`old`,e),new:new Np(`new`,e)}}function Fp(e){this._fragmentFiber=e,this._observers=this._eventListeners=null}Fp.prototype.addEventListener=function(e,t,n){var r=null,i=null;if(!(n!=null&&typeof n!=`boolean`&&(r=n.signal||null,r!==null&&r.aborted))){this._eventListeners===null&&(this._eventListeners=[]);var a=this._eventListeners;if(Bp(a,e,t,n)===-1){var o=this,s=t;n!=null&&typeof n!=`boolean`&&!0===n.once&&(s=function(r){o.removeEventListener(e,t,n),typeof t==`function`?t.call(this,r):t.handleEvent(r)}),r!==null&&(i=o.removeEventListener.bind(o,e,t,n),r.addEventListener(`abort`,i,{once:!0}),i=r.removeEventListener.bind(r,`abort`,i)),r=Rp(n),a.push({type:e,listener:t,optionsOrUseCapture:n,attachedListener:s,cleanup:i}),h(this._fragmentFiber.child,!1,Ip,e,s,r)}this._eventListeners=a}};function Ip(e,t,n,r){return b(e).addEventListener(t,n,r),!1}Fp.prototype.removeEventListener=function(e,t,n){var r=this._eventListeners;if(r!==null&&(t=Bp(r,e,t,n),t!==-1)){var i=r[t];n=i.attachedListener;var a=i.cleanup;i=Rp(i.optionsOrUseCapture),h(this._fragmentFiber.child,!1,Lp,e,n,i),r.splice(t,1),a!==null&&a()}};function Lp(e,t,n,r){return b(e).removeEventListener(t,n,r),!1}function Rp(e){return e!=null&&typeof e!=`boolean`&&(!0===e.once||e.signal instanceof AbortSignal)?{capture:e.capture,passive:e.passive}:e}function zp(e){return e==null?`c=0`:typeof e==`boolean`?`c=`+(e?`1`:`0`):`c=`+(e.capture?`1`:`0`)}function Bp(e,t,n,r){if(e.length===0)return-1;r=zp(r);for(var i=0;i<e.length;i++){var a=e[i];if(a.type===t&&a.listener===n&&zp(a.optionsOrUseCapture)===r)return i}return-1}Fp.prototype.dispatchEvent=function(e){var t=g(this._fragmentFiber);if(t===null)return!0;t=b(t);var n=this._eventListeners;if(n!==null&&0<n.length||!e.bubbles){var r=t.nodeType===9?t.createComment(``):document.createTextNode(``);if(n)for(var i=0;i<n.length;i++){var a=n[i];r.addEventListener(a.type,a.attachedListener,Rp(a.optionsOrUseCapture))}if(t.appendChild(r),e=r.dispatchEvent(e),n)for(i=0;i<n.length;i++)a=n[i],r.removeEventListener(a.type,a.attachedListener,Rp(a.optionsOrUseCapture));return t.removeChild(r),e}return t.dispatchEvent(e)},Fp.prototype.focus=function(e){h(this._fragmentFiber.child,!0,Vp,e,void 0,void 0)};function Vp(e,t){return e.tag!==6&&(e=b(e),pm(e,t))}Fp.prototype.focusLast=function(e){var t=[];h(this._fragmentFiber.child,!0,Hp,t,void 0,void 0);for(var n=t.length-1;0<=n&&!Vp(t[n],e);n--);};function Hp(e,t){return t.push(e),!1}Fp.prototype.blur=function(){var e=g(this._fragmentFiber);e!==null&&(e=b(e),e=lp(e).activeElement,e!==null&&h(this._fragmentFiber.child,!1,Up,e,void 0,void 0))};function Up(e,t){return e.tag!==6&&(e=b(e),e===t||e.contains(t)?(t.blur(),!0):!1)}Fp.prototype.observeUsing=function(e){this._observers===null&&(this._observers=new Set),this._observers.add(e),h(this._fragmentFiber.child,!1,Wp,e,void 0,void 0)};function Wp(e,t){return e.tag===6||(e=b(e),t.observe(e)),!1}Fp.prototype.unobserveUsing=function(e){var t=this._observers;if(t!==null&&t.has(e)){t.delete(e),h(this._fragmentFiber.child,!1,Gp,e,void 0,void 0);for(var n=t=0;n<Kp.length;n++){var r=Kp[n];r.fragmentInstance===this&&r.observer===e?e.unobserve(r.instance):Kp[t++]=r}Kp.length=t}};function Gp(e,t){return e.tag===6||(e=b(e),t.unobserve(e)),!1}var Kp=[],qp=!1;function Jp(e,t,n){Kp.push({fragmentInstance:e,observer:t,instance:n}),qp||(qp=!0,mm(function(){qp=!1;var e=Kp;Kp=[];for(var t=0;t<e.length;t++){var n=e[t];n.observer.unobserve(n.instance)}}))}Fp.prototype.getClientRects=function(){var e=[];return h(this._fragmentFiber.child,!1,Yp,e,void 0,void 0),e};function Yp(e,t){if(e.tag===6){e=e.stateNode;var n=e.ownerDocument.createRange();n.selectNodeContents(e),t.push.apply(t,n.getClientRects())}else e=b(e),t.push.apply(t,e.getClientRects());return!1}Fp.prototype.getRootNode=function(e){var t=g(this._fragmentFiber);return t===null?this:b(t).getRootNode(e)},Fp.prototype.compareDocumentPosition=function(e){var t=g(this._fragmentFiber);if(t===null)return Node.DOCUMENT_POSITION_DISCONNECTED;var n=[];h(this._fragmentFiber.child,!1,Hp,n,void 0,void 0);var r=b(t);if(n.length===0){if(n=r,_(this._fragmentFiber)){a:{for(t=this._fragmentFiber.return;t!==null;){if(t.tag===4){t=t.stateNode.containerInfo;break a}if(t.tag===3||t.tag===5||t.tag===27)break;t=t.return}t=null}t!=null&&(n=t)}t=this._fragmentFiber;var i=r=n.compareDocumentPosition(e);return n===e?i=Node.DOCUMENT_POSITION_CONTAINS:r&Node.DOCUMENT_POSITION_CONTAINED_BY&&(n=v(t)[1],n===null?i=Node.DOCUMENT_POSITION_PRECEDING:(e=b(n).compareDocumentPosition(e),i=e===0||e&Node.DOCUMENT_POSITION_FOLLOWING?Node.DOCUMENT_POSITION_FOLLOWING:Node.DOCUMENT_POSITION_PRECEDING)),i|=Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC}t=b(n[0]),i=b(n[n.length-1]);var a=_(this._fragmentFiber)?t.parentElement:r;if(a==null)return Node.DOCUMENT_POSITION_DISCONNECTED;r=a.compareDocumentPosition(t)&Node.DOCUMENT_POSITION_CONTAINED_BY,a=a.compareDocumentPosition(i)&Node.DOCUMENT_POSITION_CONTAINED_BY;var o=t.compareDocumentPosition(e),s=i.compareDocumentPosition(e),c=o&Node.DOCUMENT_POSITION_CONTAINED_BY||s&Node.DOCUMENT_POSITION_CONTAINED_BY;return s=r&&a&&o&Node.DOCUMENT_POSITION_FOLLOWING&&s&Node.DOCUMENT_POSITION_PRECEDING,t=r&&t===e||a&&i===e||c||s?Node.DOCUMENT_POSITION_CONTAINED_BY:!r&&t===e||!a&&i===e?Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC:o,t&Node.DOCUMENT_POSITION_DISCONNECTED||t&Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC||Xp(t,this._fragmentFiber,n[0],n[n.length-1],e)?t:Node.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC};function Xp(e,t,n,r,i){var a=jt(i);if(e&Node.DOCUMENT_POSITION_CONTAINED_BY){if(n=!!a)a:{for(;a!==null;){if(a.tag===7&&(a===t||a.alternate===t)){n=!0;break a}a=a.return}n=!1}return n}if(e&Node.DOCUMENT_POSITION_CONTAINS){if(a===null)return a=i.ownerDocument,i===a||i===a.documentElement||i===a.body;a:{for(a=t,t=g(t);a!==null;){if(!(a.tag!==5&&a.tag!==3&&a.tag!==27||a!==t&&a.alternate!==t)){a=!0;break a}a=a.return}a=!1}return a}return e&Node.DOCUMENT_POSITION_PRECEDING?((t=!!a)&&!(t=a===n)&&(t=E(n,a,T),t===null?t=!1:(h(t,!0,C,a,n),a=x,x=null,t=a!==null)),t):e&Node.DOCUMENT_POSITION_FOLLOWING?((t=!!a)&&!(t=a===r)&&(t=E(r,a,T),t===null?t=!1:(h(t,!0,w,a,r),a=x,S=x=null,t=a!==null)),t):!1}function Zp(e,t){var n=e.ownerDocument.createRange();n.selectNodeContents(e),e=n.getBoundingClientRect(),window.scrollTo(window.scrollX+e.left,t?window.scrollY+e.top:window.scrollY+e.bottom-window.innerHeight)}Fp.prototype.scrollIntoView=function(e){if(typeof e==`object`)throw Error(i(566));var t=[];h(this._fragmentFiber.child,!1,Hp,t,void 0,void 0);var n=!1!==e;if(t.length===0){var r=v(this._fragmentFiber);if(r=n?r[1]||r[0]||g(this._fragmentFiber):r[0]||r[1],r===null)return;if(r.tag===6){e=b(r),Zp(e,n);return}if(r=b(r),r.nodeType!==9){if(r.nodeType===11){n=`host`in r?r.host:null,n!==null&&n.scrollIntoView(e);return}r.scrollIntoView(e)}}for(r=n?t.length-1:0;r!==(n?-1:t.length);){var a=t[r];a.tag===6?(a=b(a),Zp(a,n)):b(a).scrollIntoView(e),r+=n?-1:1}};function Qp(e,t){return e=b(e),$p(e,t),!1}function $p(e,t){e.reactFragments??=new Set,e.reactFragments.add(t)}function em(e,t){var n=t._eventListeners;if(n!==null)for(var r=0;r<n.length;r++){var i=n[r];e.addEventListener(i.type,i.attachedListener,Rp(i.optionsOrUseCapture))}e.nodeType!==3&&(n=t._observers,n!==null&&n.forEach(function(n){for(var r=0,i=0;i<Kp.length;i++){var a=Kp[i];(a.fragmentInstance!==t||a.observer!==n||a.instance!==e)&&(Kp[r++]=a)}Kp.length=r,n.observe(e)}),$p(e,t))}function tm(e,t){var n=t._eventListeners;if(n!==null)for(var r=0;r<n.length;r++){var i=n[r];e.removeEventListener(i.type,i.attachedListener,Rp(i.optionsOrUseCapture))}e.nodeType!==3&&(n=t._observers,n!==null&&n.forEach(function(n){typeof n.rootMargin==`string`?Jp(t,n,e):n.unobserve(e)}),e.reactFragments!=null&&e.reactFragments.delete(t))}function nm(e){var t=e.firstChild;for(t&&t.nodeType===10&&(t=t.nextSibling);t;){var n=t;switch(t=t.nextSibling,n.nodeName){case`HTML`:case`HEAD`:case`BODY`:nm(n),At(n);continue;case`SCRIPT`:case`STYLE`:continue;case`LINK`:if(n.rel.toLowerCase()===`stylesheet`)continue}e.removeChild(n)}}function rm(e,t,n,r){for(;e.nodeType===1;){var i=n;if(e.nodeName.toLowerCase()!==t.toLowerCase()){if(!r&&(e.nodeName!==`INPUT`||e.type!==`hidden`))break}else if(!r){if(t===`input`&&e.type===`hidden`){var a=i.name==null?null:``+i.name;if(i.type===`hidden`&&e.getAttribute(`name`)===a)return e}else return e}else if(!e[Ot])switch(t){case`meta`:if(!e.hasAttribute(`itemprop`))break;return e;case`link`:if(a=e.getAttribute(`rel`),a===`stylesheet`&&e.hasAttribute(`data-precedence`)||a!==i.rel||e.getAttribute(`href`)!==(i.href==null||i.href===``?null:i.href)||e.getAttribute(`crossorigin`)!==(i.crossOrigin==null?null:i.crossOrigin)||e.getAttribute(`title`)!==(i.title==null?null:i.title))break;return e;case`style`:if(e.hasAttribute(`data-precedence`))break;return e;case`script`:if(a=e.getAttribute(`src`),(a!==(i.src==null?null:i.src)||e.getAttribute(`type`)!==(i.type==null?null:i.type)||e.getAttribute(`crossorigin`)!==(i.crossOrigin==null?null:i.crossOrigin))&&a&&e.hasAttribute(`async`)&&!e.hasAttribute(`itemprop`))break;return e;default:return e}if(e=lm(e.nextSibling),e===null)break}return null}function im(e,t,n){if(t===``)return null;for(;e.nodeType!==3;)if((e.nodeType!==1||e.nodeName!==`INPUT`||e.type!==`hidden`)&&!n||(e=lm(e.nextSibling),e===null))return null;return e}function am(e,t){for(;e.nodeType!==8;)if((e.nodeType!==1||e.nodeName!==`INPUT`||e.type!==`hidden`)&&!t||(e=lm(e.nextSibling),e===null))return null;return e}function om(e){return e.data===`$?`||e.data===`$~`}function sm(e){return e.data===`$!`||e.data===`$?`&&e.ownerDocument.readyState!==`loading`}function cm(e,t){var n=e.ownerDocument;if(e.data===`$~`)e._reactRetry=t;else if(e.data!==`$?`||n.readyState!==`loading`)t();else{var r=function(){t(),n.removeEventListener(`DOMContentLoaded`,r)};n.addEventListener(`DOMContentLoaded`,r),e._reactRetry=r}}function lm(e){for(;e!=null;e=e.nextSibling){var t=e.nodeType;if(t===1||t===3)break;if(t===8){if(t=e.data,t===`$`||t===`$!`||t===`$?`||t===`$~`||t===`&`||t===`F!`||t===`F`)break;if(t===`/$`||t===`/&`)return null}}return e}var um=null;function dm(e){e=e.nextSibling;for(var t=0;e;){if(e.nodeType===8){var n=e.data;if(n===`/$`||n===`/&`){if(t===0)return lm(e.nextSibling);t--}else n!==`$`&&n!==`$!`&&n!==`$?`&&n!==`$~`&&n!==`&`||t++}e=e.nextSibling}return null}function fm(e){e=e.previousSibling;for(var t=0;e;){if(e.nodeType===8){var n=e.data;if(n===`$`||n===`$!`||n===`$?`||n===`$~`||n===`&`){if(t===0)return e;t--}else n!==`/$`&&n!==`/&`||t++}e=e.previousSibling}return null}function pm(e,t){function n(){r=!0}if(e.ownerDocument.activeElement===e)return!0;var r=!1;try{e.ownerDocument.addEventListener(`focus`,n,!0),(e.focus||HTMLElement.prototype.focus).call(e,t)}finally{e.ownerDocument.removeEventListener(`focus`,n,!0)}return r}function mm(e){yp(function(){yp(function(t){return e(t)})})}function hm(e,t,n){switch(t=lp(n),e){case`html`:if(e=t.documentElement,!e)throw Error(i(452));return e;case`head`:if(e=t.head,!e)throw Error(i(453));return e;case`body`:if(e=t.body,!e)throw Error(i(454));return e;default:throw Error(i(451))}}function gm(e,t,n){for(var r in n){var i=n[r];n.hasOwnProperty(r)&&i!=null&&$(e,t,r,null,rp,i)}n.dangerouslySetInnerHTML!=null&&(e.textContent=``),e.onclick===_n&&(e.onclick=null),At(e)}function _m(e){for(var t=e.attributes;t.length;)e.removeAttributeNode(t[0]);At(e)}var vm=new Map,ym=new Set;function bm(e){if(typeof e.getRootNode==`function`){var t=e.getRootNode();if(t.nodeType===9||t.nodeType===11)return t}return e.nodeType===9?e:e.ownerDocument}var xm=I.d;I.d={f:Sm,r:Cm,D:Em,C:Dm,L:Om,m:km,X:jm,S:Am,M:Mm};function Sm(){var e=xm.f(),t=Rd();return e||t}function Cm(e){var t=Mt(e);t!==null&&t.tag===5&&t.type===`form`?ec(t):xm.r(e)}var wm=typeof document>`u`?null:document;function Tm(e,t,n){var r=wm;if(r&&typeof t==`string`&&t){var i=tn(t);i=`link[rel="`+e+`"][href="`+i+`"]`,typeof n==`string`&&(i+=`[crossorigin="`+n+`"]`),ym.has(i)||(ym.add(i),e={rel:e,crossOrigin:n,href:t},r.querySelector(i)===null&&(t=r.createElement(`link`),np(t,`link`,e),Ft(t),r.head.appendChild(t)))}}function Em(e){xm.D(e),Tm(`dns-prefetch`,e,null)}function Dm(e,t){xm.C(e,t),Tm(`preconnect`,e,t)}function Om(e,t,n){xm.L(e,t,n);var r=wm;if(r&&e&&t){var i=`link[rel="preload"][as="`+tn(t)+`"]`;t===`image`&&n&&n.imageSrcSet?(i+=`[imagesrcset="`+tn(n.imageSrcSet)+`"]`,typeof n.imageSizes==`string`&&(i+=`[imagesizes="`+tn(n.imageSizes)+`"]`)):i+=`[href="`+tn(e)+`"]`;var a=i;switch(t){case`style`:a=Pm(e);break;case`script`:a=Rm(e)}if(!(vm.has(a)||(e=D({rel:`preload`,href:t===`image`&&n&&n.imageSrcSet?void 0:e,as:t},n),vm.set(a,e),r.querySelector(i)!==null||t===`style`&&r.querySelector(Fm(a))||t===`script`&&r.querySelector(zm(a))))){var o=r.createElement(`link`);np(o,`link`,e),t===`style`&&(o[kt]=!0,o.onload=o.onerror=function(){It(o)}),Ft(o),r.head.appendChild(o)}}}function km(e,t){xm.m(e,t);var n=wm;if(n&&e){var r=t&&typeof t.as==`string`?t.as:`script`,i=`link[rel="modulepreload"][as="`+tn(r)+`"][href="`+tn(e)+`"]`,a=i;switch(r){case`audioworklet`:case`paintworklet`:case`serviceworker`:case`sharedworker`:case`worker`:case`script`:a=Rm(e)}if(!vm.has(a)&&(e=D({rel:`modulepreload`,href:e},t),vm.set(a,e),n.querySelector(i)===null)){switch(r){case`audioworklet`:case`paintworklet`:case`serviceworker`:case`sharedworker`:case`worker`:case`script`:if(n.querySelector(zm(a)))return}r=n.createElement(`link`),np(r,`link`,e),Ft(r),n.head.appendChild(r)}}}function Am(e,t,n){xm.S(e,t,n);var r=wm;if(r&&e){var i=Pt(r).hoistableStyles,a=Pm(e);t||=`default`;var o=i.get(a);if(!o){var s={loading:0,preload:null};if(o=r.querySelector(Fm(a)))s.loading=5;else{e=D({rel:`stylesheet`,href:e,"data-precedence":t},n),(n=vm.get(a))&&Hm(e,n);var c=o=r.createElement(`link`);Ft(c),np(c,`link`,e),c._p=new Promise(function(e,t){c.onload=e,c.onerror=t}),c.addEventListener(`load`,function(){s.loading|=1}),c.addEventListener(`error`,function(){s.loading|=2}),s.loading|=4,Vm(o,t,r)}o={type:`stylesheet`,instance:o,count:1,state:s},i.set(a,o)}}}function jm(e,t){xm.X(e,t);var n=wm;if(n&&e){var r=Pt(n).hoistableScripts,i=Rm(e),a=r.get(i);a||(a=n.querySelector(zm(i)),a||(e=D({src:e,async:!0},t),(t=vm.get(i))&&Um(e,t),a=n.createElement(`script`),Ft(a),np(a,`link`,e),n.head.appendChild(a)),a={type:`script`,instance:a,count:1,state:null},r.set(i,a))}}function Mm(e,t){xm.M(e,t);var n=wm;if(n&&e){var r=Pt(n).hoistableScripts,i=Rm(e),a=r.get(i);a||(a=n.querySelector(zm(i)),a||(e=D({src:e,async:!0,type:`module`},t),(t=vm.get(i))&&Um(e,t),a=n.createElement(`script`),Ft(a),np(a,`link`,e),n.head.appendChild(a)),a={type:`script`,instance:a,count:1,state:null},r.set(i,a))}}function Nm(e,t,n,r){var a=(a=xe.current)?bm(a):null;if(!a)throw Error(i(446));switch(e){case`meta`:case`title`:return null;case`style`:return typeof n.precedence==`string`&&typeof n.href==`string`?(n=Pm(n.href),t=Pt(a).hoistableStyles,r=t.get(n),r||(r={type:`style`,instance:null,count:0,state:null},t.set(n,r)),r):{type:`void`,instance:null,count:0,state:null};case`link`:if(n.rel===`stylesheet`&&typeof n.href==`string`&&typeof n.precedence==`string`){e=Pm(n.href);var o=Pt(a).hoistableStyles,s=o.get(e);if(s||(a=a.ownerDocument||a,s={type:`stylesheet`,instance:null,count:0,state:{loading:0,preload:null}},o.set(e,s),(o=a.querySelector(Fm(e)))?o._p||(s.instance=o,s.state.loading=5):(o=vm.get(e),o||(o={rel:`preload`,as:`style`,href:n.href,crossOrigin:n.crossOrigin,integrity:n.integrity,media:n.media,hrefLang:n.hrefLang,referrerPolicy:n.referrerPolicy},vm.set(e,o)),Lm(a,e,o,s.state))),t&&r===null)throw Error(i(528,``));return s}if(t&&r!==null)throw Error(i(529,``));return null;case`script`:return t=n.async,n=n.src,typeof n==`string`&&t&&typeof t!=`function`&&typeof t!=`symbol`?(n=Rm(n),t=Pt(a).hoistableScripts,r=t.get(n),r||(r={type:`script`,instance:null,count:0,state:null},t.set(n,r)),r):{type:`void`,instance:null,count:0,state:null};default:throw Error(i(444,e))}}function Pm(e){return`href="`+tn(e)+`"`}function Fm(e){return`link[rel="stylesheet"][`+e+`]`}function Im(e){return D({},e,{"data-precedence":e.precedence,precedence:null})}function Lm(e,t,n,r){if(t=e.querySelector(`link[rel="preload"][as="style"][`+t+`]`)){if(!0!==t[kt]){r.loading=1;return}}else t=e.createElement(`link`),t[kt]=!0,t.onload=t.onerror=It.bind(null,t),np(t,`link`,n),Ft(t),e.head.appendChild(t);r.preload=t,t.addEventListener(`load`,function(){return r.loading|=1}),t.addEventListener(`error`,function(){return r.loading|=2})}function Rm(e){return`[src="`+tn(e)+`"]`}function zm(e){return`script[async]`+e}function Bm(e,t,n){if(t.count++,t.instance===null)switch(t.type){case`style`:var r=e.querySelector(`style[data-href~="`+tn(n.href)+`"]`);if(r)return t.instance=r,Ft(r),r;var a=D({},n,{"data-href":n.href,"data-precedence":n.precedence,href:null,precedence:null});return r=(e.ownerDocument||e).createElement(`style`),Ft(r),np(r,`style`,a),Vm(r,n.precedence,e),t.instance=r;case`stylesheet`:a=Pm(n.href);var o=e.querySelector(Fm(a));if(o)return t.state.loading|=4,t.instance=o,Ft(o),o;r=Im(n),(a=vm.get(a))&&Hm(r,a),o=(e.ownerDocument||e).createElement(`link`),Ft(o);var s=o;return s._p=new Promise(function(e,t){s.onload=e,s.onerror=t}),np(o,`link`,r),t.state.loading|=4,Vm(o,n.precedence,e),t.instance=o;case`script`:return o=Rm(n.src),(a=e.querySelector(zm(o)))?(t.instance=a,Ft(a),a):(r=n,(a=vm.get(o))&&(r=D({},n),Um(r,a)),e=e.ownerDocument||e,a=e.createElement(`script`),Ft(a),np(a,`link`,r),e.head.appendChild(a),t.instance=a);case`void`:return null;default:throw Error(i(443,t.type))}else t.type===`stylesheet`&&!(t.state.loading&4)&&(r=t.instance,t.state.loading|=4,Vm(r,n.precedence,e));return t.instance}function Vm(e,t,n){for(var r=n.querySelectorAll(`link[rel="stylesheet"][data-precedence],style[data-precedence]`),i=r.length?r[r.length-1]:null,a=i,o=0;o<r.length;o++){var s=r[o];if(s.dataset.precedence===t)a=s;else if(a!==i)break}a?a.parentNode.insertBefore(e,a.nextSibling):(t=n.nodeType===9?n.head:n,t.insertBefore(e,t.firstChild))}function Hm(e,t){e.crossOrigin??=t.crossOrigin,e.referrerPolicy??=t.referrerPolicy,e.title??=t.title}function Um(e,t){e.crossOrigin??=t.crossOrigin,e.referrerPolicy??=t.referrerPolicy,e.integrity??=t.integrity}var Wm=null;function Gm(e,t,n){if(Wm===null){var r=new Map,i=Wm=new Map;i.set(n,r)}else i=Wm,r=i.get(n),r||(r=new Map,i.set(n,r));if(r.has(e))return r;for(r.set(e,null),n=n.getElementsByTagName(e),i=0;i<n.length;i++){var a=n[i];if(!(a[Ot]||a[xt]||e===`link`&&a.getAttribute(`rel`)===`stylesheet`)&&a.namespaceURI!==`http://www.w3.org/2000/svg`){var o=a.getAttribute(t)||``;o=e+o;var s=r.get(o);s?s.push(a):r.set(o,[a])}}return r}function Km(e,t,n){e=e.ownerDocument||e,e.head.insertBefore(n,t===`title`?e.querySelector(`head > title`):null)}function qm(e,t,n){if(n===1||t.itemProp!=null)return!1;switch(e){case`meta`:case`title`:return!0;case`style`:if(typeof t.precedence!=`string`||typeof t.href!=`string`||t.href===``)break;return!0;case`link`:if(typeof t.rel!=`string`||typeof t.href!=`string`||t.href===``||t.onLoad||t.onError)break;switch(t.rel){case`stylesheet`:return e=t.disabled,typeof t.precedence==`string`&&e==null;default:return!0}case`script`:if(t.async&&typeof t.async!=`function`&&typeof t.async!=`symbol`&&!t.onLoad&&!t.onError&&t.src&&typeof t.src==`string`)return!0}return!1}function Jm(e,t){return e===`img`&&t.src!=null&&t.src!==``&&t.onLoad==null&&t.loading!==`lazy`}function Ym(e){return!(e.type===`stylesheet`&&!(e.state.loading&3))}function Xm(e){return(e.width||100)*(e.height||100)*(typeof devicePixelRatio==`number`?devicePixelRatio:1)*.25}function Zm(e,t){typeof t.decode==`function`&&(e.imgCount++,t.complete||(e.imgBytes+=Xm(t),e.suspenseyImages.push(t)),e=rh.bind(e),t.decode().then(e,e))}function Qm(e,t,n,r){if(n.type===`stylesheet`&&(typeof r.media!=`string`||!1!==matchMedia(r.media).matches)&&!(n.state.loading&4)){if(n.instance===null){var i=Pm(r.href),a=t.querySelector(Fm(i));if(a){t=a._p,typeof t==`object`&&t&&typeof t.then==`function`&&(e.count++,e=nh.bind(e),t.then(e,e)),n.state.loading|=4,n.instance=a,Ft(a);return}a=t.ownerDocument||t,r=Im(r),(i=vm.get(i))&&Hm(r,i),a=a.createElement(`link`),Ft(a);var o=a;o._p=new Promise(function(e,t){o.onload=e,o.onerror=t}),np(a,`link`,r),n.instance=a}e.stylesheets===null&&(e.stylesheets=new Map),e.stylesheets.set(n,t),(t=n.state.preload)&&!(n.state.loading&3)&&(e.count++,n=nh.bind(e),t.addEventListener(`load`,n),t.addEventListener(`error`,n))}}var $m=0;function eh(e,t){return e.stylesheets&&e.count===0&&ah(e,e.stylesheets),0<e.count||0<e.imgCount?function(n){var r=setTimeout(function(){if(e.stylesheets&&ah(e,e.stylesheets),e.unsuspend){var t=e.unsuspend;e.unsuspend=null,t()}},6e4+t);0<e.imgBytes&&$m===0&&($m=62500*op());var i=setTimeout(function(){if(e.waitingForImages=!1,e.count===0&&(e.stylesheets&&ah(e,e.stylesheets),e.unsuspend)){var t=e.unsuspend;e.unsuspend=null,t()}},(e.imgBytes>$m?50:800)+t);return e.unsuspend=n,function(){e.unsuspend=null,clearTimeout(r),clearTimeout(i)}}:null}function th(e){if(e.count===0&&(e.imgCount===0||!e.waitingForImages)){if(e.stylesheets)ah(e,e.stylesheets);else if(e.unsuspend){var t=e.unsuspend;e.unsuspend=null,t()}}}function nh(){this.count--,th(this)}function rh(){this.imgCount--,th(this)}var ih=null;function ah(e,t){e.stylesheets=null,e.unsuspend!==null&&(e.count++,ih=new Map,t.forEach(oh,e),ih=null,nh.call(e))}function oh(e,t){if(!(t.state.loading&4)){var n=ih.get(e);if(n)var r=n.get(null);else{n=new Map,ih.set(e,n);for(var i=e.querySelectorAll(`link[data-precedence],style[data-precedence]`),a=0;a<i.length;a++){var o=i[a];(o.nodeName===`LINK`||o.getAttribute(`media`)!==`not all`)&&(n.set(o.dataset.precedence,o),r=o)}r&&n.set(null,r)}i=t.instance,o=i.getAttribute(`data-precedence`),a=n.get(o)||r,a===r&&n.set(null,i),n.set(o,i),this.count++,r=nh.bind(this),i.addEventListener(`load`,r),i.addEventListener(`error`,r),a?a.parentNode.insertBefore(i,a.nextSibling):(e=e.nodeType===9?e.head:e,e.insertBefore(i,e.firstChild)),t.state.loading|=4}}var sh={$$typeof:N,Provider:null,Consumer:null,_currentValue:ge,_currentValue2:ge,_threadCount:0};function ch(e,t,n,r,i,a,o,s,c){this.tag=1,this.containerInfo=e,this.pingCache=this.current=this.pendingChildren=null,this.timeoutHandle=-1,this.callbackNode=this.next=this.pendingContext=this.context=this.cancelPendingCommit=null,this.callbackPriority=0,this.expirationTimes=ut(-1),this.entangledLanes=this.shellSuspendCounter=this.errorRecoveryDisabledLanes=this.expiredLanes=this.warmLanes=this.pingedLanes=this.suspendedLanes=this.pendingLanes=0,this.entanglements=ut(0),this.hiddenUpdates=ut(null),this.identifierPrefix=r,this.onUncaughtError=i,this.onCaughtError=a,this.onRecoverableError=o,this.pooledCache=null,this.pooledCacheLanes=0,this.formState=c,this.transitionTypes=null,this.incompleteTransitions=new Map}function lh(e,t,n,r,i,a,o,s,c,l,u,d){return e=new ch(e,t,n,o,c,l,u,d,s),t=1,!0===a&&(t|=24),a=ji(3,null,null,t),e.current=a,a.stateNode=e,t=ja(),t.refCount++,e.pooledCache=t,t.refCount++,a.memoizedState={element:r,isDehydrated:n,cache:t},po(a),e}function uh(e){return e?(e=ki,e):ki}function dh(e,t,n,r,i,a){i=uh(i),r.context===null?r.context=i:r.pendingContext=i,r=ho(t),r.payload={element:n},a=a===void 0?null:a,a!==null&&(r.callback=a),n=go(e,r,t),n!==null&&(Nd(n,e,t),_o(n,e,t))}function fh(e,t){if(e=e.memoizedState,e!==null&&e.dehydrated!==null){var n=e.retryLane;e.retryLane=n!==0&&n<t?n:t}}function ph(e,t){fh(e,t),(e=e.alternate)&&fh(e,t)}function mh(e){if(e.tag===13||e.tag===31){var t=Ei(e,67108864);t!==null&&Nd(t,e,67108864),ph(e,67108864)}}function hh(e){if(e.tag===13||e.tag===31){var t=Ad();t=gt(t);var n=Ei(e,t);n!==null&&Nd(n,e,t),ph(e,t)}}var gh=!0;function _h(e,t,n,r){var i=F.T;F.T=null;var a=I.p;try{I.p=2,yh(e,t,n,r)}finally{I.p=a,F.T=i}}function vh(e,t,n,r){var i=F.T;F.T=null;var a=I.p;try{I.p=8,yh(e,t,n,r)}finally{I.p=a,F.T=i}}function yh(e,t,n,r){if(gh){var i=bh(r);if(i===null)Kf(e,t,r,xh,n),Mh(e,r);else if(Ph(i,e,t,n,r))r.stopPropagation();else if(Mh(e,r),t&4&&-1<jh.indexOf(e)){for(;i!==null;){var a=Mt(i);if(a!==null)switch(a.tag){case 3:if(a=a.stateNode,a.current.memoizedState.isDehydrated){var o=it(a.pendingLanes);if(o!==0){var s=a;for(s.pendingLanes|=2,s.entangledLanes|=2;o;){var c=1<<31-Ze(o);s.entanglements[1]|=c,o&=~c}Ef(a),!(J&6)&&(hd=ze()+500,Df(0,!1))}}break;case 31:case 13:s=Ei(a,2),s!==null&&Nd(s,a,2),Rd(),ph(a,2)}if(a=bh(r),a===null&&Kf(e,t,r,xh,n),a===i)break;i=a}i!==null&&r.stopPropagation()}else Kf(e,t,r,null,n)}}function bh(e){return e=yn(e),Sh(e)}var xh=null;function Sh(e){if(xh=null,e=jt(e),e!==null){var t=o(e);if(t===null)e=null;else{var n=t.tag;if(n===13){if(e=s(t),e!==null)return e;e=null}else if(n===31){if(e=c(t),e!==null)return e;e=null}else if(n===3){if(t.stateNode.current.memoizedState.isDehydrated)return t.tag===3?t.stateNode.containerInfo:null;e=null}else t!==e&&(e=null)}}return xh=e,null}function Ch(e){switch(e){case`beforetoggle`:case`cancel`:case`click`:case`close`:case`contextmenu`:case`copy`:case`cut`:case`auxclick`:case`dblclick`:case`dragend`:case`dragstart`:case`drop`:case`focusin`:case`focusout`:case`input`:case`invalid`:case`keydown`:case`keypress`:case`keyup`:case`mousedown`:case`mouseup`:case`paste`:case`pause`:case`play`:case`pointercancel`:case`pointerdown`:case`pointerup`:case`ratechange`:case`reset`:case`seeked`:case`submit`:case`toggle`:case`touchcancel`:case`touchend`:case`touchstart`:case`volumechange`:case`change`:case`selectionchange`:case`textInput`:case`compositionstart`:case`compositionend`:case`compositionupdate`:case`beforeblur`:case`afterblur`:case`beforeinput`:case`blur`:case`fullscreenchange`:case`fullscreenerror`:case`focus`:case`hashchange`:case`popstate`:case`select`:case`selectstart`:return 2;case`drag`:case`dragenter`:case`dragexit`:case`dragleave`:case`dragover`:case`mousemove`:case`mouseout`:case`mouseover`:case`pointermove`:case`pointerout`:case`pointerover`:case`resize`:case`scroll`:case`touchmove`:case`wheel`:case`mouseenter`:case`mouseleave`:case`pointerenter`:case`pointerleave`:return 8;case`message`:switch(Be()){case Ve:return 2;case He:return 8;case Ue:case We:return 32;case Ge:return 268435456;default:return 32}default:return 32}}var wh=!1,Th=null,Eh=null,Dh=null,Oh=new Map,kh=new Map,Ah=[],jh=`mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset`.split(` `);function Mh(e,t){switch(e){case`focusin`:case`focusout`:Th=null;break;case`dragenter`:case`dragleave`:Eh=null;break;case`mouseover`:case`mouseout`:Dh=null;break;case`pointerover`:case`pointerout`:Oh.delete(t.pointerId);break;case`gotpointercapture`:case`lostpointercapture`:kh.delete(t.pointerId)}}function Nh(e,t,n,r,i,a){return e===null||e.nativeEvent!==a?(e={blockedOn:t,domEventName:n,eventSystemFlags:r,nativeEvent:a,targetContainers:[i]},t!==null&&(t=Mt(t),t!==null&&mh(t)),e):(e.eventSystemFlags|=r,t=e.targetContainers,i!==null&&t.indexOf(i)===-1&&t.push(i),e)}function Ph(e,t,n,r,i){switch(t){case`focusin`:return Th=Nh(Th,e,t,n,r,i),!0;case`dragenter`:return Eh=Nh(Eh,e,t,n,r,i),!0;case`mouseover`:return Dh=Nh(Dh,e,t,n,r,i),!0;case`pointerover`:var a=i.pointerId;return Oh.set(a,Nh(Oh.get(a)||null,e,t,n,r,i)),!0;case`gotpointercapture`:return a=i.pointerId,kh.set(a,Nh(kh.get(a)||null,e,t,n,r,i)),!0}return!1}function Fh(e){var t=jt(e.target);if(t!==null){var n=o(t);if(n!==null){if(t=n.tag,t===13){if(t=s(n),t!==null){e.blockedOn=t,yt(e.priority,function(){hh(n)});return}}else if(t===31){if(t=c(n),t!==null){e.blockedOn=t,yt(e.priority,function(){hh(n)});return}}else if(t===3&&n.stateNode.current.memoizedState.isDehydrated){e.blockedOn=n.tag===3?n.stateNode.containerInfo:null;return}}}e.blockedOn=null}function Ih(e){if(e.blockedOn!==null)return!1;for(var t=e.targetContainers;0<t.length;){var n=bh(e.nativeEvent);if(n===null){n=e.nativeEvent;var r=new n.constructor(n.type,n);vn=r,n.target.dispatchEvent(r),vn=null}else return t=Mt(n),t!==null&&mh(t),e.blockedOn=n,!1;t.shift()}return!0}function Lh(e,t,n){Ih(e)&&n.delete(t)}function Rh(){wh=!1,Th!==null&&Ih(Th)&&(Th=null),Eh!==null&&Ih(Eh)&&(Eh=null),Dh!==null&&Ih(Dh)&&(Dh=null),Oh.forEach(Lh),kh.forEach(Lh)}function zh(e,n){e.blockedOn===n&&(e.blockedOn=null,wh||(wh=!0,t.unstable_scheduleCallback(t.unstable_NormalPriority,Rh)))}var Bh=null;function Vh(e){Bh!==e&&(Bh=e,t.unstable_scheduleCallback(t.unstable_NormalPriority,function(){Bh===e&&(Bh=null);for(var t=0;t<e.length;t+=3){var n=e[t],r=e[t+1],i=e[t+2];if(typeof r!=`function`){if(Sh(r||n)===null)continue;break}var a=Mt(n);a!==null&&(e.splice(t,3),t-=3,Qs(a,{pending:!0,data:i,method:n.method,action:r},r,i))}}))}function Hh(e){function t(t){return zh(t,e)}Th!==null&&zh(Th,e),Eh!==null&&zh(Eh,e),Dh!==null&&zh(Dh,e),Oh.forEach(t),kh.forEach(t);for(var n=0;n<Ah.length;n++){var r=Ah[n];r.blockedOn===e&&(r.blockedOn=null)}for(;0<Ah.length&&(n=Ah[0],n.blockedOn===null);)Fh(n),n.blockedOn===null&&Ah.shift();if(n=(e.ownerDocument||e).$$reactFormReplay,n!=null)for(r=0;r<n.length;r+=3){var i=n[r],a=n[r+1],o=i[St]||null;if(typeof a==`function`)o||Vh(n);else if(o){var s=null;if(a&&a.hasAttribute(`formAction`)){if(i=a,o=a[St]||null)s=o.formAction;else if(Sh(i)!==null)continue}else s=o.action;typeof s==`function`?n[r+1]=s:(n.splice(r,3),r-=3),Vh(n)}}}function Uh(){function e(e){e.canIntercept&&e.info===`react-transition`&&e.intercept({handler:function(){return new Promise(function(e){return i=e})},focusReset:`manual`,scroll:`manual`})}function t(){i!==null&&(i(),i=null),r||setTimeout(n,20)}function n(){if(!r&&!navigation.transition){var e=navigation.currentEntry;e&&e.url!=null&&navigation.navigate(e.url,{state:e.getState(),info:`react-transition`,history:`replace`})}}if(typeof navigation==`object`){var r=!1,i=null;return navigation.addEventListener(`navigate`,e),navigation.addEventListener(`navigatesuccess`,t),navigation.addEventListener(`navigateerror`,t),setTimeout(n,100),function(){r=!0,navigation.removeEventListener(`navigate`,e),navigation.removeEventListener(`navigatesuccess`,t),navigation.removeEventListener(`navigateerror`,t),i!==null&&(i(),i=null)}}}function Wh(e){this._internalRoot=e}Gh.prototype.render=Wh.prototype.render=function(e){var t=this._internalRoot;if(t===null)throw Error(i(409));var n=t.current;dh(n,Ad(),e,t,null,null)},Gh.prototype.unmount=Wh.prototype.unmount=function(){var e=this._internalRoot;if(e!==null){this._internalRoot=null;var t=e.containerInfo;dh(e.current,2,null,e,null,null),Rd(),t[Ct]=null}};function Gh(e){this._internalRoot=e}Gh.prototype.unstable_scheduleHydration=function(e){if(e){var t=vt();e={blockedOn:null,target:e,priority:t};for(var n=0;n<Ah.length&&t!==0&&t<Ah[n].priority;n++);Ah.splice(n,0,e),n===0&&Fh(e)}};var Kh=n.version;if(Kh!==`19.3.1`)throw Error(i(527,Kh,`19.3.1`));I.findDOMNode=function(e){var t=e._reactInternals;if(t===void 0)throw typeof e.render==`function`?Error(i(188)):(e=Object.keys(e).join(`,`),Error(i(268,e)));return e=d(t),e=e===null?null:p(e),e=e===null?null:e.stateNode,e};var qh={bundleType:0,version:`19.3.1`,rendererPackageName:`react-dom`,currentDispatcherRef:F,reconcilerVersion:`19.3.1`};if(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__<`u`){var Jh=__REACT_DEVTOOLS_GLOBAL_HOOK__;if(!Jh.isDisabled&&Jh.supportsFiber)try{Je=Jh.inject(qh),Ye=Jh}catch{}}e.createRoot=function(e,t){if(!a(e))throw Error(i(299));var n=!1,r=``,o=xc,s=Sc,c=Cc;return t!=null&&(!0===t.unstable_strictMode&&(n=!0),t.identifierPrefix!==void 0&&(r=t.identifierPrefix),t.onUncaughtError!==void 0&&(o=t.onUncaughtError),t.onCaughtError!==void 0&&(s=t.onCaughtError),t.onRecoverableError!==void 0&&(c=t.onRecoverableError)),t=lh(e,1,!1,null,null,n,r,null,o,s,c,Uh),e[Ct]=t.current,Wf(e),new Wh(t)}})),g=o(((e,t)=>{function n(){if(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__<`u`&&typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE==`function`)try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n)}catch(e){console.error(e)}}n(),t.exports=h()})),_=c(u(),1),v=g(),y=`cogit-data`,b=`cogit-live`,x=`cogit-token`;function S(e){return e.normalize(`NFKD`).replace(/\\p{M}+/gu,``).replace(/[I\u0131]/g,`i`).toLowerCase()}function C(e){return S(e.normalize(`NFC`))}function w(e){return C(e).replace(/\\s+/g,` `).trim()}function T(e,t){let n=0,r=0;for(let i of e){if(n>=t)return r;n+=S(i).length,r+=i.length}return e.length}function E(e,t,n=120){if(t===``)return null;let r=C(e).indexOf(t);if(r<0)return null;let i=T(e,r),a=T(e,r+t.length),o=Math.min(i,40),s=Math.max(0,n-o-(a-i)),c=i-o,l=Math.min(e.length,a+s),u=e.slice(c,l).replace(/\\s+/g,` `).trim();return`${c>0?`\u2026`:``}${u}${l<e.length?`\u2026`:``}`}var D=Symbol(`no-hit`);function O(e,t,n){if(e===void 0||e===``)return D;let r=E(e,t);return r===null?D:{field:n,excerpt:r}}function k(e,t){for(let n of[e.title,e.summary,e.why,...(e.alternatives??[]).flatMap(e=>[e.option,e.why]),...e.work??[],...(e.agentDecisions??[]).flatMap(e=>[e.title,e.why,...(e.alternatives??[]).flatMap(e=>[e.option,e.why])])]){let e=O(n,t,`title`);if(e!==D)return e}return D}function A(e,t){if(e.branch===void 0)return D;for(let n of[e.branch.title,e.branch.asked,e.branch.outcome,e.branch.open]){let e=O(n,t,`branch`);if(e!==D)return e}return D}function j(e,t){if(e===void 0)return D;let n=O(e.text,t,`conversation`);if(n!==D)return n;for(let n of e.replies){let e=O(n,t,`conversation`);if(e!==D)return e}return D}function ee(e,t){return e?.find(e=>e.id===t.id||e.label!==void 0&&e.label===t.label)}function te(e,t,n){let r=k(e,n);if(r!==D)return r;let i=A(e,n);return i===D?j(ee(t,e),n):i}function M(e,t){let n=e.status,r=n===void 0?[]:[n.goal,...n.done,...n.pending.map(e=>e.text),n.next];for(let n of[e.title,...r]){let e=O(n,t,`session`);if(e!==D)return e}return D}function N(e){if(e==null)return-1/0;let t=Date.parse(e);return Number.isNaN(t)?-1/0:t}function ne(e){let t=e===null?null:/^m([1-9][0-9]*)$/.exec(e);return t===null?-1:Number(t[1])}function re(e,t){let n=w(t);if(n===``)return[];let r=[];for(let t of e){let e=M(t,n);if(e!==D){let n=t.messages[t.messages.length-1];r.push({sessionId:t.sessionId,sessionTitle:t.title,messageId:null,label:null,at:t.updatedAt??t.startedAt??n?.at??null,field:e.field,excerpt:e.excerpt})}for(let e of t.messages){let i=te(e,t.chat,n);i!==D&&r.push({sessionId:t.sessionId,sessionTitle:t.title,messageId:e.id,label:e.label??null,at:e.at??null,field:i.field,excerpt:i.excerpt})}}return r.sort((e,t)=>N(t.at)-N(e.at)||e.sessionId.localeCompare(t.sessionId)||ne(t.label)-ne(e.label))}function ie(e){return[...new Set(e.map(e=>e.sessionId))]}function P(e,t,n){return t===0?0:Math.min(Math.max(e+n,0),t-1)}function ae(e){let t=new Map;for(let n of e){if(n.messageId===null)continue;let e=t.get(n.sessionId)??new Set;e.add(n.messageId),t.set(n.sessionId,e)}return t}function oe(e){return/^h[0-9a-f]{6,12}$/.test(e.trim().toLowerCase())}function se(e,t){let n=t.trim().toLowerCase(),r=e.sessions.flatMap(e=>e.messages.filter(e=>e.id.startsWith(n)).map(t=>({session:e,message:t})));if(r.length===0)return{kind:`none`};if(r.length>1)return{kind:`ambiguous`,count:r.length};let i=r[0];return{kind:`ok`,sessionId:i.session.sessionId,messageId:i.message.id,label:i.message.label??null,title:i.message.title}}function ce(e,t){let n=e.sessions;return re(n.map(e=>({sessionId:e.sessionId,title:e.title,status:e.status,startedAt:e.startedAt,updatedAt:e.updatedAt,messages:e.messages,...e.chat===void 0?{}:{chat:e.chat}})),t)}function le(e){let t;try{t=JSON.parse(e)}catch{throw Error(`The embedded cogit data is not valid JSON.`)}if(typeof t!=`object`||!t||!(`kind`in t))throw Error(`The embedded cogit data is not a view model.`);if(t.kind!==`lineage`&&t.kind!==`panel`)throw Error(`Unsupported cogit view: ${String(t.kind)}`);return t}async function ue(e=document){let t=e.getElementById(y)?.textContent?.trim();if(t)return le(t);throw Error("No cogit data in this page. Run `cogit build`.")}function de(e=document){return e.querySelector(`meta[name="${b}"]`)!==null}function fe(e=document){return e.querySelector(`meta[name="${x}"]`)?.getAttribute(`content`)?.trim()||null}async function pe(e){let t=await fetch(`/api/config`,{headers:{"x-cogit-token":e},cache:`no-store`});if(!t.ok){let e=(await t.text()).trim();throw Error(e||`could not read settings (HTTP ${t.status})`)}return(await t.json()).settings??{}}async function me(e,t,n,r){let i=await fetch(`/api/read`,{method:`POST`,headers:{"content-type":`application/json`,"x-cogit-token":r},body:JSON.stringify({dir:e,id:t,read:n})});if(!i.ok){let e=(await i.text()).trim();throw Error(e||`could not save the read mark (HTTP ${i.status})`)}}async function he(e,t){let n=await fetch(`/api/map-view?dir=${encodeURIComponent(e)}`,{headers:{"x-cogit-token":t},cache:`no-store`});if(!n.ok){let e=(await n.text()).trim();throw Error(e||`could not read the map view (HTTP ${n.status})`)}return await n.json()}async function F(e,t,n){let r=await fetch(`/api/open-sessions`,{method:`POST`,headers:{"content-type":`application/json`,"x-cogit-token":n},body:JSON.stringify({dir:e,open:t})});if(!r.ok){let e=(await r.text()).trim();throw Error(e||`could not save the open sessions (HTTP ${r.status})`)}}async function I(e,t,n,r){let i=await fetch(`/api/row-width`,{method:`POST`,headers:{"content-type":`application/json`,"x-cogit-token":r},body:JSON.stringify({dir:e,sessionId:t,width:n})});if(!i.ok){let e=(await i.text()).trim();throw Error(e||`could not save the row width (HTTP ${i.status})`)}}async function ge(e,t,n,r){let i=await fetch(`/api/inbox/dismiss`,{method:`POST`,headers:{"content-type":`application/json`,"x-cogit-token":r},body:JSON.stringify({dir:e,sessionId:t,at:n})});if(!i.ok){let e=(await i.text()).trim();throw Error(e||`could not dismiss the row (HTTP ${i.status})`)}}async function _e(e,t,n,r){let i=new URLSearchParams({dir:e,commit:t});n!==void 0&&i.set(`file`,n);let a=await fetch(`/api/diff?${i.toString()}`,{headers:{"x-cogit-token":r},cache:`no-store`});if(!a.ok){let e=(await a.text()).trim();throw Error(e||`could not read the diff (HTTP ${a.status})`)}let o=await a.json().catch(()=>null);return typeof o?.text==`string`?o.text:``}async function ve(e,t,n){let r=await fetch(`/api/config`,{method:`POST`,headers:{"content-type":`application/json`,"x-cogit-token":n},body:JSON.stringify({key:e,value:t})});if(!r.ok){let e=(await r.text()).trim();throw Error(e||`could not save (HTTP ${r.status})`)}return(await r.json().catch(()=>null))?.value??t}var ye=o((e=>{var t=Symbol.for(`react.transitional.element`),n=Symbol.for(`react.fragment`);function r(e,n,r){var i=null;if(r!==void 0&&(i=``+r),n.key!==void 0&&(i=``+n.key),`key`in n)for(var a in r={},n)a!==`key`&&(r[a]=n[a]);else r=n;return n=r.ref,{$$typeof:t,type:e,key:i,ref:n===void 0?null:n,props:r}}e.Fragment=n,e.jsx=r,e.jsxs=r})),L=o(((e,t)=>{t.exports=ye()}))();function R({home:e=!1}){let t=(0,L.jsxs)(L.Fragment,{children:[`cogit`,(0,L.jsx)(`span`,{className:`brand-tagline`,children:`Cogito, ergo commit.`})]});return e||!de()?(0,L.jsx)(`span`,{className:`brand`,"aria-label":`cogit`,children:t}):(0,L.jsx)(`a`,{className:`brand`,href:`/`,"aria-label":`cogit: all projects`,children:t})}function be(){return de()?(0,L.jsx)(`a`,{className:`back-link`,href:`/`,children:`\u2190 All projects`}):null}function z(e){if(typeof e==`string`||typeof e==`number`)return``+e;let t=``;if(Array.isArray(e))for(let n=0,r;n<e.length;n++)(r=z(e[n]))!==``&&(t+=(t&&` `)+r);else for(let n in e)e[n]&&(t+=(t&&` `)+n);return t}var xe={value:()=>{}};function Se(){for(var e=0,t=arguments.length,n={},r;e<t;++e){if(!(r=arguments[e]+``)||r in n||/[\\s.]/.test(r))throw Error(`illegal type: `+r);n[r]=[]}return new Ce(n)}function Ce(e){this._=e}function we(e,t){return e.trim().split(/^|\\s+/).map(function(e){var n=``,r=e.indexOf(`.`);if(r>=0&&(n=e.slice(r+1),e=e.slice(0,r)),e&&!t.hasOwnProperty(e))throw Error(`unknown type: `+e);return{type:e,name:n}})}Ce.prototype=Se.prototype={constructor:Ce,on:function(e,t){var n=this._,r=we(e+``,n),i,a=-1,o=r.length;if(arguments.length<2){for(;++a<o;)if((i=(e=r[a]).type)&&(i=Te(n[i],e.name)))return i}else{if(t!=null&&typeof t!=`function`)throw Error(`invalid callback: `+t);for(;++a<o;)if(i=(e=r[a]).type)n[i]=Ee(n[i],e.name,t);else if(t==null)for(i in n)n[i]=Ee(n[i],e.name,null);return this}},copy:function(){var e={},t=this._;for(var n in t)e[n]=t[n].slice();return new Ce(e)},call:function(e,t){if((i=arguments.length-2)>0)for(var n=Array(i),r=0,i,a;r<i;++r)n[r]=arguments[r+2];if(!this._.hasOwnProperty(e))throw Error(`unknown type: `+e);for(a=this._[e],r=0,i=a.length;r<i;++r)a[r].value.apply(t,n)},apply:function(e,t,n){if(!this._.hasOwnProperty(e))throw Error(`unknown type: `+e);for(var r=this._[e],i=0,a=r.length;i<a;++i)r[i].value.apply(t,n)}};function Te(e,t){for(var n=0,r=e.length,i;n<r;++n)if((i=e[n]).name===t)return i.value}function Ee(e,t,n){for(var r=0,i=e.length;r<i;++r)if(e[r].name===t){e[r]=xe,e=e.slice(0,r).concat(e.slice(r+1));break}return n!=null&&e.push({name:t,value:n}),e}var De={svg:`http://www.w3.org/2000/svg`,xhtml:`http://www.w3.org/1999/xhtml`,xlink:`http://www.w3.org/1999/xlink`,xml:`http://www.w3.org/XML/1998/namespace`,xmlns:`http://www.w3.org/2000/xmlns/`};function Oe(e){var t=e+=``,n=t.indexOf(`:`);return n>=0&&(t=e.slice(0,n))!==`xmlns`&&(e=e.slice(n+1)),De.hasOwnProperty(t)?{space:De[t],local:e}:e}function ke(e){return function(){var t=this.ownerDocument,n=this.namespaceURI;return n===`http://www.w3.org/1999/xhtml`&&t.documentElement.namespaceURI===`http://www.w3.org/1999/xhtml`?t.createElement(e):t.createElementNS(n,e)}}function Ae(e){return function(){return this.ownerDocument.createElementNS(e.space,e.local)}}function je(e){var t=Oe(e);return(t.local?Ae:ke)(t)}function Me(){}function Ne(e){return e==null?Me:function(){return this.querySelector(e)}}function Pe(e){typeof e!=`function`&&(e=Ne(e));for(var t=this._groups,n=t.length,r=Array(n),i=0;i<n;++i)for(var a=t[i],o=a.length,s=r[i]=Array(o),c,l,u=0;u<o;++u)(c=a[u])&&(l=e.call(c,c.__data__,u,a))&&(`__data__`in c&&(l.__data__=c.__data__),s[u]=l);return new Sn(r,this._parents)}function Fe(e){return e==null?[]:Array.isArray(e)?e:Array.from(e)}function Ie(){return[]}function Le(e){return e==null?Ie:function(){return this.querySelectorAll(e)}}function Re(e){return function(){return Fe(e.apply(this,arguments))}}function ze(e){e=typeof e==`function`?Re(e):Le(e);for(var t=this._groups,n=t.length,r=[],i=[],a=0;a<n;++a)for(var o=t[a],s=o.length,c,l=0;l<s;++l)(c=o[l])&&(r.push(e.call(c,c.__data__,l,o)),i.push(c));return new Sn(r,i)}function Be(e){return function(){return this.matches(e)}}function Ve(e){return function(t){return t.matches(e)}}var He=Array.prototype.find;function Ue(e){return function(){return He.call(this.children,e)}}function We(){return this.firstElementChild}function Ge(e){return this.select(e==null?We:Ue(typeof e==`function`?e:Ve(e)))}var Ke=Array.prototype.filter;function qe(){return Array.from(this.children)}function Je(e){return function(){return Ke.call(this.children,e)}}function Ye(e){return this.selectAll(e==null?qe:Je(typeof e==`function`?e:Ve(e)))}function Xe(e){typeof e!=`function`&&(e=Be(e));for(var t=this._groups,n=t.length,r=Array(n),i=0;i<n;++i)for(var a=t[i],o=a.length,s=r[i]=[],c,l=0;l<o;++l)(c=a[l])&&e.call(c,c.__data__,l,a)&&s.push(c);return new Sn(r,this._parents)}function Ze(e){return Array(e.length)}function Qe(){return new Sn(this._enter||this._groups.map(Ze),this._parents)}function $e(e,t){this.ownerDocument=e.ownerDocument,this.namespaceURI=e.namespaceURI,this._next=null,this._parent=e,this.__data__=t}$e.prototype={constructor:$e,appendChild:function(e){return this._parent.insertBefore(e,this._next)},insertBefore:function(e,t){return this._parent.insertBefore(e,t)},querySelector:function(e){return this._parent.querySelector(e)},querySelectorAll:function(e){return this._parent.querySelectorAll(e)}};function et(e){return function(){return e}}function tt(e,t,n,r,i,a){for(var o=0,s,c=t.length,l=a.length;o<l;++o)(s=t[o])?(s.__data__=a[o],r[o]=s):n[o]=new $e(e,a[o]);for(;o<c;++o)(s=t[o])&&(i[o]=s)}function nt(e,t,n,r,i,a,o){var s,c,l=new Map,u=t.length,d=a.length,f=Array(u),p;for(s=0;s<u;++s)(c=t[s])&&(f[s]=p=o.call(c,c.__data__,s,t)+``,l.has(p)?i[s]=c:l.set(p,c));for(s=0;s<d;++s)p=o.call(e,a[s],s,a)+``,(c=l.get(p))?(r[s]=c,c.__data__=a[s],l.delete(p)):n[s]=new $e(e,a[s]);for(s=0;s<u;++s)(c=t[s])&&l.get(f[s])===c&&(i[s]=c)}function rt(e){return e.__data__}function it(e,t){if(!arguments.length)return Array.from(this,rt);var n=t?nt:tt,r=this._parents,i=this._groups;typeof e!=`function`&&(e=et(e));for(var a=i.length,o=Array(a),s=Array(a),c=Array(a),l=0;l<a;++l){var u=r[l],d=i[l],f=d.length,p=at(e.call(u,u&&u.__data__,l,r)),m=p.length,h=s[l]=Array(m),g=o[l]=Array(m);n(u,d,h,g,c[l]=Array(f),p,t);for(var _=0,v=0,y,b;_<m;++_)if(y=h[_]){for(_>=v&&(v=_+1);!(b=g[v])&&++v<m;);y._next=b||null}}return o=new Sn(o,r),o._enter=s,o._exit=c,o}function at(e){return typeof e==`object`&&`length`in e?e:Array.from(e)}function ot(){return new Sn(this._exit||this._groups.map(Ze),this._parents)}function st(e,t,n){var r=this.enter(),i=this,a=this.exit();return typeof e==`function`?(r=e(r),r&&=r.selection()):r=r.append(e+``),t!=null&&(i=t(i),i&&=i.selection()),n==null?a.remove():n(a),r&&i?r.merge(i).order():i}function ct(e){for(var t=e.selection?e.selection():e,n=this._groups,r=t._groups,i=n.length,a=r.length,o=Math.min(i,a),s=Array(i),c=0;c<o;++c)for(var l=n[c],u=r[c],d=l.length,f=s[c]=Array(d),p,m=0;m<d;++m)(p=l[m]||u[m])&&(f[m]=p);for(;c<i;++c)s[c]=n[c];return new Sn(s,this._parents)}function lt(){for(var e=this._groups,t=-1,n=e.length;++t<n;)for(var r=e[t],i=r.length-1,a=r[i],o;--i>=0;)(o=r[i])&&(a&&o.compareDocumentPosition(a)^4&&a.parentNode.insertBefore(o,a),a=o);return this}function ut(e){e||=dt;function t(t,n){return t&&n?e(t.__data__,n.__data__):!t-!n}for(var n=this._groups,r=n.length,i=Array(r),a=0;a<r;++a){for(var o=n[a],s=o.length,c=i[a]=Array(s),l,u=0;u<s;++u)(l=o[u])&&(c[u]=l);c.sort(t)}return new Sn(i,this._parents).order()}function dt(e,t){return e<t?-1:e>t?1:e>=t?0:NaN}function ft(){var e=arguments[0];return arguments[0]=this,e.apply(null,arguments),this}function pt(){return Array.from(this)}function mt(){for(var e=this._groups,t=0,n=e.length;t<n;++t)for(var r=e[t],i=0,a=r.length;i<a;++i){var o=r[i];if(o)return o}return null}function ht(){let e=0;for(let t of this)++e;return e}function gt(){return!this.node()}function _t(e){for(var t=this._groups,n=0,r=t.length;n<r;++n)for(var i=t[n],a=0,o=i.length,s;a<o;++a)(s=i[a])&&e.call(s,s.__data__,a,i);return this}function vt(e){return function(){this.removeAttribute(e)}}function yt(e){return function(){this.removeAttributeNS(e.space,e.local)}}function bt(e,t){return function(){this.setAttribute(e,t)}}function xt(e,t){return function(){this.setAttributeNS(e.space,e.local,t)}}function St(e,t){return function(){var n=t.apply(this,arguments);n==null?this.removeAttribute(e):this.setAttribute(e,n)}}function Ct(e,t){return function(){var n=t.apply(this,arguments);n==null?this.removeAttributeNS(e.space,e.local):this.setAttributeNS(e.space,e.local,n)}}function wt(e,t){var n=Oe(e);if(arguments.length<2){var r=this.node();return n.local?r.getAttributeNS(n.space,n.local):r.getAttribute(n)}return this.each((t==null?n.local?yt:vt:typeof t==`function`?n.local?Ct:St:n.local?xt:bt)(n,t))}function Tt(e){return e.ownerDocument&&e.ownerDocument.defaultView||e.document&&e||e.defaultView}function Et(e){return function(){this.style.removeProperty(e)}}function Dt(e,t,n){return function(){this.style.setProperty(e,t,n)}}function Ot(e,t,n){return function(){var r=t.apply(this,arguments);r==null?this.style.removeProperty(e):this.style.setProperty(e,r,n)}}function kt(e,t,n){return arguments.length>1?this.each((t==null?Et:typeof t==`function`?Ot:Dt)(e,t,n??``)):At(this.node(),e)}function At(e,t){return e.style.getPropertyValue(t)||Tt(e).getComputedStyle(e,null).getPropertyValue(t)}function jt(e){return function(){delete this[e]}}function Mt(e,t){return function(){this[e]=t}}function Nt(e,t){return function(){var n=t.apply(this,arguments);n==null?delete this[e]:this[e]=n}}function Pt(e,t){return arguments.length>1?this.each((t==null?jt:typeof t==`function`?Nt:Mt)(e,t)):this.node()[e]}function Ft(e){return e.trim().split(/^|\\s+/)}function It(e){return e.classList||new Lt(e)}function Lt(e){this._node=e,this._names=Ft(e.getAttribute(`class`)||``)}Lt.prototype={add:function(e){this._names.indexOf(e)<0&&(this._names.push(e),this._node.setAttribute(`class`,this._names.join(` `)))},remove:function(e){var t=this._names.indexOf(e);t>=0&&(this._names.splice(t,1),this._node.setAttribute(`class`,this._names.join(` `)))},contains:function(e){return this._names.indexOf(e)>=0}};function Rt(e,t){for(var n=It(e),r=-1,i=t.length;++r<i;)n.add(t[r])}function zt(e,t){for(var n=It(e),r=-1,i=t.length;++r<i;)n.remove(t[r])}function Bt(e){return function(){Rt(this,e)}}function Vt(e){return function(){zt(this,e)}}function Ht(e,t){return function(){(t.apply(this,arguments)?Rt:zt)(this,e)}}function Ut(e,t){var n=Ft(e+``);if(arguments.length<2){for(var r=It(this.node()),i=-1,a=n.length;++i<a;)if(!r.contains(n[i]))return!1;return!0}return this.each((typeof t==`function`?Ht:t?Bt:Vt)(n,t))}function Wt(){this.textContent=``}function B(e){return function(){this.textContent=e}}function Gt(e){return function(){var t=e.apply(this,arguments);this.textContent=t??``}}function Kt(e){return arguments.length?this.each(e==null?Wt:(typeof e==`function`?Gt:B)(e)):this.node().textContent}function qt(){this.innerHTML=``}function Jt(e){return function(){this.innerHTML=e}}function Yt(e){return function(){var t=e.apply(this,arguments);this.innerHTML=t??``}}function Xt(e){return arguments.length?this.each(e==null?qt:(typeof e==`function`?Yt:Jt)(e)):this.node().innerHTML}function Zt(){this.nextSibling&&this.parentNode.appendChild(this)}function Qt(){return this.each(Zt)}function $t(){this.previousSibling&&this.parentNode.insertBefore(this,this.parentNode.firstChild)}function en(){return this.each($t)}function tn(e){var t=typeof e==`function`?e:je(e);return this.select(function(){return this.appendChild(t.apply(this,arguments))})}function nn(){return null}function rn(e,t){var n=typeof e==`function`?e:je(e),r=t==null?nn:typeof t==`function`?t:Ne(t);return this.select(function(){return this.insertBefore(n.apply(this,arguments),r.apply(this,arguments)||null)})}function an(){var e=this.parentNode;e&&e.removeChild(this)}function on(){return this.each(an)}function sn(){var e=this.cloneNode(!1),t=this.parentNode;return t?t.insertBefore(e,this.nextSibling):e}function cn(){var e=this.cloneNode(!0),t=this.parentNode;return t?t.insertBefore(e,this.nextSibling):e}function ln(e){return this.select(e?cn:sn)}function un(e){return arguments.length?this.property(`__data__`,e):this.node().__data__}function dn(e){return function(t){e.call(this,t,this.__data__)}}function fn(e){return e.trim().split(/^|\\s+/).map(function(e){var t=``,n=e.indexOf(`.`);return n>=0&&(t=e.slice(n+1),e=e.slice(0,n)),{type:e,name:t}})}function pn(e){return function(){var t=this.__on;if(t){for(var n=0,r=-1,i=t.length,a;n<i;++n)a=t[n],(!e.type||a.type===e.type)&&a.name===e.name?this.removeEventListener(a.type,a.listener,a.options):t[++r]=a;++r?t.length=r:delete this.__on}}}function mn(e,t,n){return function(){var r=this.__on,i,a=dn(t);if(r){for(var o=0,s=r.length;o<s;++o)if((i=r[o]).type===e.type&&i.name===e.name){this.removeEventListener(i.type,i.listener,i.options),this.addEventListener(i.type,i.listener=a,i.options=n),i.value=t;return}}this.addEventListener(e.type,a,n),i={type:e.type,name:e.name,value:t,listener:a,options:n},r?r.push(i):this.__on=[i]}}function hn(e,t,n){var r=fn(e+``),i,a=r.length,o;if(arguments.length<2){var s=this.node().__on;if(s){for(var c=0,l=s.length,u;c<l;++c)for(i=0,u=s[c];i<a;++i)if((o=r[i]).type===u.type&&o.name===u.name)return u.value}}else{for(s=t?mn:pn,i=0;i<a;++i)this.each(s(r[i],t,n));return this}}function gn(e,t,n){var r=Tt(e),i=r.CustomEvent;typeof i==`function`?i=new i(t,n):(i=r.document.createEvent(`Event`),n?(i.initEvent(t,n.bubbles,n.cancelable),i.detail=n.detail):i.initEvent(t,!1,!1)),e.dispatchEvent(i)}function _n(e,t){return function(){return gn(this,e,t)}}function vn(e,t){return function(){return gn(this,e,t.apply(this,arguments))}}function yn(e,t){return this.each((typeof t==`function`?vn:_n)(e,t))}function*bn(){for(var e=this._groups,t=0,n=e.length;t<n;++t)for(var r=e[t],i=0,a=r.length,o;i<a;++i)(o=r[i])&&(yield o)}var xn=[null];function Sn(e,t){this._groups=e,this._parents=t}function Cn(){return new Sn([[document.documentElement]],xn)}function wn(){return this}Sn.prototype=Cn.prototype={constructor:Sn,select:Pe,selectAll:ze,selectChild:Ge,selectChildren:Ye,filter:Xe,data:it,enter:Qe,exit:ot,join:st,merge:ct,selection:wn,order:lt,sort:ut,call:ft,nodes:pt,node:mt,size:ht,empty:gt,each:_t,attr:wt,style:kt,property:Pt,classed:Ut,text:Kt,html:Xt,raise:Qt,lower:en,append:tn,insert:rn,remove:on,clone:ln,datum:un,on:hn,dispatch:yn,[Symbol.iterator]:bn};function Tn(e){return typeof e==`string`?new Sn([[document.querySelector(e)]],[document.documentElement]):new Sn([[e]],xn)}function En(e){let t;for(;t=e.sourceEvent;)e=t;return e}function Dn(e,t){if(e=En(e),t===void 0&&(t=e.currentTarget),t){var n=t.ownerSVGElement||t;if(n.createSVGPoint){var r=n.createSVGPoint();return r.x=e.clientX,r.y=e.clientY,r=r.matrixTransform(t.getScreenCTM().inverse()),[r.x,r.y]}if(t.getBoundingClientRect){var i=t.getBoundingClientRect();return[e.clientX-i.left-t.clientLeft,e.clientY-i.top-t.clientTop]}}return[e.pageX,e.pageY]}var On={passive:!1},kn={capture:!0,passive:!1};function An(e){e.stopImmediatePropagation()}function jn(e){e.preventDefault(),e.stopImmediatePropagation()}function Mn(e){var t=e.document.documentElement,n=Tn(e).on(`dragstart.drag`,jn,kn);`onselectstart`in t?n.on(`selectstart.drag`,jn,kn):(t.__noselect=t.style.MozUserSelect,t.style.MozUserSelect=`none`)}function Nn(e,t){var n=e.document.documentElement,r=Tn(e).on(`dragstart.drag`,null);t&&(r.on(`click.drag`,jn,kn),setTimeout(function(){r.on(`click.drag`,null)},0)),`onselectstart`in n?r.on(`selectstart.drag`,null):(n.style.MozUserSelect=n.__noselect,delete n.__noselect)}var Pn=e=>()=>e;function Fn(e,{sourceEvent:t,subject:n,target:r,identifier:i,active:a,x:o,y:s,dx:c,dy:l,dispatch:u}){Object.defineProperties(this,{type:{value:e,enumerable:!0,configurable:!0},sourceEvent:{value:t,enumerable:!0,configurable:!0},subject:{value:n,enumerable:!0,configurable:!0},target:{value:r,enumerable:!0,configurable:!0},identifier:{value:i,enumerable:!0,configurable:!0},active:{value:a,enumerable:!0,configurable:!0},x:{value:o,enumerable:!0,configurable:!0},y:{value:s,enumerable:!0,configurable:!0},dx:{value:c,enumerable:!0,configurable:!0},dy:{value:l,enumerable:!0,configurable:!0},_:{value:u}})}Fn.prototype.on=function(){var e=this._.on.apply(this._,arguments);return e===this._?this:e};function In(e){return!e.ctrlKey&&!e.button}function Ln(){return this.parentNode}function Rn(e,t){return t??{x:e.x,y:e.y}}function zn(){return navigator.maxTouchPoints||`ontouchstart`in this}function Bn(){var e=In,t=Ln,n=Rn,r=zn,i={},a=Se(`start`,`drag`,`end`),o=0,s,c,l,u,d=0;function f(e){e.on(`mousedown.drag`,p).filter(r).on(`touchstart.drag`,g).on(`touchmove.drag`,_,On).on(`touchend.drag touchcancel.drag`,v).style(`touch-action`,`none`).style(`-webkit-tap-highlight-color`,`rgba(0,0,0,0)`)}function p(n,r){if(!u&&e.call(this,n,r)){var i=y(this,t.call(this,n,r),n,r,`mouse`);i&&(Tn(n.view).on(`mousemove.drag`,m,kn).on(`mouseup.drag`,h,kn),Mn(n.view),An(n),l=!1,s=n.clientX,c=n.clientY,i(`start`,n))}}function m(e){if(jn(e),!l){var t=e.clientX-s,n=e.clientY-c;l=t*t+n*n>d}i.mouse(`drag`,e)}function h(e){Tn(e.view).on(`mousemove.drag mouseup.drag`,null),Nn(e.view,l),jn(e),i.mouse(`end`,e)}function g(n,r){if(e.call(this,n,r))for(var i=n.changedTouches,a=t.call(this,n,r),o=i.length,s=0,c;s<o;++s)(c=y(this,a,n,r,i[s].identifier,i[s]))&&(An(n),c(`start`,n,i[s]))}function _(e){for(var t=e.changedTouches,n=t.length,r=0,a;r<n;++r)(a=i[t[r].identifier])&&(jn(e),a(`drag`,e,t[r]))}function v(e){var t=e.changedTouches,n=t.length,r,a;for(u&&clearTimeout(u),u=setTimeout(function(){u=null},500),r=0;r<n;++r)(a=i[t[r].identifier])&&(An(e),a(`end`,e,t[r]))}function y(e,t,r,s,c,l){var u=a.copy(),d=Dn(l||r,t),p,m,h;if((h=n.call(e,new Fn(`beforestart`,{sourceEvent:r,target:f,identifier:c,active:o,x:d[0],y:d[1],dx:0,dy:0,dispatch:u}),s))!=null)return p=h.x-d[0]||0,m=h.y-d[1]||0,function n(r,a,l){var g=d,_;switch(r){case`start`:i[c]=n,_=o++;break;case`end`:delete i[c],--o;case`drag`:d=Dn(l||a,t),_=o}u.call(r,e,new Fn(r,{sourceEvent:a,subject:h,target:f,identifier:c,active:_,x:d[0]+p,y:d[1]+m,dx:d[0]-g[0],dy:d[1]-g[1],dispatch:u}),s)}}return f.filter=function(t){return arguments.length?(e=typeof t==`function`?t:Pn(!!t),f):e},f.container=function(e){return arguments.length?(t=typeof e==`function`?e:Pn(e),f):t},f.subject=function(e){return arguments.length?(n=typeof e==`function`?e:Pn(e),f):n},f.touchable=function(e){return arguments.length?(r=typeof e==`function`?e:Pn(!!e),f):r},f.on=function(){var e=a.on.apply(a,arguments);return e===a?f:e},f.clickDistance=function(e){return arguments.length?(d=(e=+e)*e,f):Math.sqrt(d)},f}function Vn(e,t,n){e.prototype=t.prototype=n,n.constructor=e}function Hn(e,t){var n=Object.create(e.prototype);for(var r in t)n[r]=t[r];return n}function Un(){}var Wn=.7,Gn=1/Wn,Kn=`\\\\s*([+-]?\\\\d+)\\\\s*`,qn=`\\\\s*([+-]?(?:\\\\d*\\\\.)?\\\\d+(?:[eE][+-]?\\\\d+)?)\\\\s*`,Jn=`\\\\s*([+-]?(?:\\\\d*\\\\.)?\\\\d+(?:[eE][+-]?\\\\d+)?)%\\\\s*`,Yn=/^#([0-9a-f]{3,8})$/,Xn=RegExp(`^rgb\\\\(${Kn},${Kn},${Kn}\\\\)$`),Zn=RegExp(`^rgb\\\\(${Jn},${Jn},${Jn}\\\\)$`),Qn=RegExp(`^rgba\\\\(${Kn},${Kn},${Kn},${qn}\\\\)$`),$n=RegExp(`^rgba\\\\(${Jn},${Jn},${Jn},${qn}\\\\)$`),er=RegExp(`^hsl\\\\(${qn},${Jn},${Jn}\\\\)$`),tr=RegExp(`^hsla\\\\(${qn},${Jn},${Jn},${qn}\\\\)$`),nr={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074};Vn(Un,sr,{copy(e){return Object.assign(new this.constructor,this,e)},displayable(){return this.rgb().displayable()},hex:rr,formatHex:rr,formatHex8:ir,formatHsl:ar,formatRgb:or,toString:or});function rr(){return this.rgb().formatHex()}function ir(){return this.rgb().formatHex8()}function ar(){return br(this).formatHsl()}function or(){return this.rgb().formatRgb()}function sr(e){var t,n;return e=(e+``).trim().toLowerCase(),(t=Yn.exec(e))?(n=t[1].length,t=parseInt(t[1],16),n===6?cr(t):n===3?new fr(t>>8&15|t>>4&240,t>>4&15|t&240,(t&15)<<4|t&15,1):n===8?lr(t>>24&255,t>>16&255,t>>8&255,(t&255)/255):n===4?lr(t>>12&15|t>>8&240,t>>8&15|t>>4&240,t>>4&15|t&240,((t&15)<<4|t&15)/255):null):(t=Xn.exec(e))?new fr(t[1],t[2],t[3],1):(t=Zn.exec(e))?new fr(t[1]*255/100,t[2]*255/100,t[3]*255/100,1):(t=Qn.exec(e))?lr(t[1],t[2],t[3],t[4]):(t=$n.exec(e))?lr(t[1]*255/100,t[2]*255/100,t[3]*255/100,t[4]):(t=er.exec(e))?yr(t[1],t[2]/100,t[3]/100,1):(t=tr.exec(e))?yr(t[1],t[2]/100,t[3]/100,t[4]):nr.hasOwnProperty(e)?cr(nr[e]):e===`transparent`?new fr(NaN,NaN,NaN,0):null}function cr(e){return new fr(e>>16&255,e>>8&255,e&255,1)}function lr(e,t,n,r){return r<=0&&(e=t=n=NaN),new fr(e,t,n,r)}function ur(e){return e instanceof Un||(e=sr(e)),e?(e=e.rgb(),new fr(e.r,e.g,e.b,e.opacity)):new fr}function dr(e,t,n,r){return arguments.length===1?ur(e):new fr(e,t,n,r??1)}function fr(e,t,n,r){this.r=+e,this.g=+t,this.b=+n,this.opacity=+r}Vn(fr,dr,Hn(Un,{brighter(e){return e=e==null?Gn:Gn**+e,new fr(this.r*e,this.g*e,this.b*e,this.opacity)},darker(e){return e=e==null?Wn:Wn**+e,new fr(this.r*e,this.g*e,this.b*e,this.opacity)},rgb(){return this},clamp(){return new fr(_r(this.r),_r(this.g),_r(this.b),gr(this.opacity))},displayable(){return-.5<=this.r&&this.r<255.5&&-.5<=this.g&&this.g<255.5&&-.5<=this.b&&this.b<255.5&&0<=this.opacity&&this.opacity<=1},hex:pr,formatHex:pr,formatHex8:mr,formatRgb:hr,toString:hr}));function pr(){return`#${vr(this.r)}${vr(this.g)}${vr(this.b)}`}function mr(){return`#${vr(this.r)}${vr(this.g)}${vr(this.b)}${vr((isNaN(this.opacity)?1:this.opacity)*255)}`}function hr(){let e=gr(this.opacity);return`${e===1?`rgb(`:`rgba(`}${_r(this.r)}, ${_r(this.g)}, ${_r(this.b)}${e===1?`)`:`, ${e})`}`}function gr(e){return isNaN(e)?1:Math.max(0,Math.min(1,e))}function _r(e){return Math.max(0,Math.min(255,Math.round(e)||0))}function vr(e){return e=_r(e),(e<16?`0`:``)+e.toString(16)}function yr(e,t,n,r){return r<=0?e=t=n=NaN:n<=0||n>=1?e=t=NaN:t<=0&&(e=NaN),new Sr(e,t,n,r)}function br(e){if(e instanceof Sr)return new Sr(e.h,e.s,e.l,e.opacity);if(e instanceof Un||(e=sr(e)),!e)return new Sr;if(e instanceof Sr)return e;e=e.rgb();var t=e.r/255,n=e.g/255,r=e.b/255,i=Math.min(t,n,r),a=Math.max(t,n,r),o=NaN,s=a-i,c=(a+i)/2;return s?(o=t===a?(n-r)/s+(n<r)*6:n===a?(r-t)/s+2:(t-n)/s+4,s/=c<.5?a+i:2-a-i,o*=60):s=c>0&&c<1?0:o,new Sr(o,s,c,e.opacity)}function xr(e,t,n,r){return arguments.length===1?br(e):new Sr(e,t,n,r??1)}function Sr(e,t,n,r){this.h=+e,this.s=+t,this.l=+n,this.opacity=+r}Vn(Sr,xr,Hn(Un,{brighter(e){return e=e==null?Gn:Gn**+e,new Sr(this.h,this.s,this.l*e,this.opacity)},darker(e){return e=e==null?Wn:Wn**+e,new Sr(this.h,this.s,this.l*e,this.opacity)},rgb(){var e=this.h%360+(this.h<0)*360,t=isNaN(e)||isNaN(this.s)?0:this.s,n=this.l,r=n+(n<.5?n:1-n)*t,i=2*n-r;return new fr(Tr(e>=240?e-240:e+120,i,r),Tr(e,i,r),Tr(e<120?e+240:e-120,i,r),this.opacity)},clamp(){return new Sr(Cr(this.h),wr(this.s),wr(this.l),gr(this.opacity))},displayable(){return(0<=this.s&&this.s<=1||isNaN(this.s))&&0<=this.l&&this.l<=1&&0<=this.opacity&&this.opacity<=1},formatHsl(){let e=gr(this.opacity);return`${e===1?`hsl(`:`hsla(`}${Cr(this.h)}, ${wr(this.s)*100}%, ${wr(this.l)*100}%${e===1?`)`:`, ${e})`}`}}));function Cr(e){return e=(e||0)%360,e<0?e+360:e}function wr(e){return Math.max(0,Math.min(1,e||0))}function Tr(e,t,n){return(e<60?t+(n-t)*e/60:e<180?n:e<240?t+(n-t)*(240-e)/60:t)*255}var Er=e=>()=>e;function Dr(e,t){return function(n){return e+n*t}}function Or(e,t,n){return e**=+n,t=t**+n-e,n=1/n,function(r){return(e+r*t)**+n}}function kr(e){return(e=+e)==1?Ar:function(t,n){return n-t?Or(t,n,e):Er(isNaN(t)?n:t)}}function Ar(e,t){var n=t-e;return n?Dr(e,n):Er(isNaN(e)?t:e)}var jr=(function e(t){var n=kr(t);function r(e,t){var r=n((e=dr(e)).r,(t=dr(t)).r),i=n(e.g,t.g),a=n(e.b,t.b),o=Ar(e.opacity,t.opacity);return function(t){return e.r=r(t),e.g=i(t),e.b=a(t),e.opacity=o(t),e+``}}return r.gamma=e,r})(1);function Mr(e,t){t||=[];var n=e?Math.min(t.length,e.length):0,r=t.slice(),i;return function(a){for(i=0;i<n;++i)r[i]=e[i]*(1-a)+t[i]*a;return r}}function Nr(e){return ArrayBuffer.isView(e)&&!(e instanceof DataView)}function Pr(e,t){for(var n=t?t.length:0,r=e?Math.min(n,e.length):0,i=Array(r),a=Array(n),o=0;o<r;++o)i[o]=Ur(e[o],t[o]);for(;o<n;++o)a[o]=t[o];return function(e){for(o=0;o<r;++o)a[o]=i[o](e);return a}}function Fr(e,t){var n=new Date;return e=+e,t=+t,function(r){return n.setTime(e*(1-r)+t*r),n}}function Ir(e,t){return e=+e,t=+t,function(n){return e*(1-n)+t*n}}function Lr(e,t){var n={},r={},i;for(i in typeof e==`object`&&e||(e={}),typeof t==`object`&&t||(t={}),t)i in e?n[i]=Ur(e[i],t[i]):r[i]=t[i];return function(e){for(i in n)r[i]=n[i](e);return r}}var Rr=/[-+]?(?:\\d+\\.?\\d*|\\.?\\d+)(?:[eE][-+]?\\d+)?/g,zr=new RegExp(Rr.source,`g`);function Br(e){return function(){return e}}function Vr(e){return function(t){return e(t)+``}}function Hr(e,t){var n=Rr.lastIndex=zr.lastIndex=0,r,i,a,o=-1,s=[],c=[];for(e+=``,t+=``;(r=Rr.exec(e))&&(i=zr.exec(t));)(a=i.index)>n&&(a=t.slice(n,a),s[o]?s[o]+=a:s[++o]=a),(r=r[0])===(i=i[0])?s[o]?s[o]+=i:s[++o]=i:(s[++o]=null,c.push({i:o,x:Ir(r,i)})),n=zr.lastIndex;return n<t.length&&(a=t.slice(n),s[o]?s[o]+=a:s[++o]=a),s.length<2?c[0]?Vr(c[0].x):Br(t):(t=c.length,function(e){for(var n=0,r;n<t;++n)s[(r=c[n]).i]=r.x(e);return s.join(``)})}function Ur(e,t){var n=typeof t,r;return t==null||n===`boolean`?Er(t):(n===`number`?Ir:n===`string`?(r=sr(t))?(t=r,jr):Hr:t instanceof sr?jr:t instanceof Date?Fr:Nr(t)?Mr:Array.isArray(t)?Pr:typeof t.valueOf!=`function`&&typeof t.toString!=`function`||isNaN(t)?Lr:Ir)(e,t)}var Wr=180/Math.PI,Gr={translateX:0,translateY:0,rotate:0,skewX:0,scaleX:1,scaleY:1};function Kr(e,t,n,r,i,a){var o,s,c;return(o=Math.sqrt(e*e+t*t))&&(e/=o,t/=o),(c=e*n+t*r)&&(n-=e*c,r-=t*c),(s=Math.sqrt(n*n+r*r))&&(n/=s,r/=s,c/=s),e*r<t*n&&(e=-e,t=-t,c=-c,o=-o),{translateX:i,translateY:a,rotate:Math.atan2(t,e)*Wr,skewX:Math.atan(c)*Wr,scaleX:o,scaleY:s}}var qr;function Jr(e){let t=new(typeof DOMMatrix==`function`?DOMMatrix:WebKitCSSMatrix)(e+``);return t.isIdentity?Gr:Kr(t.a,t.b,t.c,t.d,t.e,t.f)}function Yr(e){return e==null||(qr||=document.createElementNS(`http://www.w3.org/2000/svg`,`g`),qr.setAttribute(`transform`,e),!(e=qr.transform.baseVal.consolidate()))?Gr:(e=e.matrix,Kr(e.a,e.b,e.c,e.d,e.e,e.f))}function Xr(e,t,n,r){function i(e){return e.length?e.pop()+` `:``}function a(e,r,i,a,o,s){if(e!==i||r!==a){var c=o.push(`translate(`,null,t,null,n);s.push({i:c-4,x:Ir(e,i)},{i:c-2,x:Ir(r,a)})}else(i||a)&&o.push(`translate(`+i+t+a+n)}function o(e,t,n,a){e===t?t&&n.push(i(n)+`rotate(`+t+r):(e-t>180?t+=360:t-e>180&&(e+=360),a.push({i:n.push(i(n)+`rotate(`,null,r)-2,x:Ir(e,t)}))}function s(e,t,n,a){e===t?t&&n.push(i(n)+`skewX(`+t+r):a.push({i:n.push(i(n)+`skewX(`,null,r)-2,x:Ir(e,t)})}function c(e,t,n,r,a,o){if(e!==n||t!==r){var s=a.push(i(a)+`scale(`,null,`,`,null,`)`);o.push({i:s-4,x:Ir(e,n)},{i:s-2,x:Ir(t,r)})}else(n!==1||r!==1)&&a.push(i(a)+`scale(`+n+`,`+r+`)`)}return function(t,n){var r=[],i=[];return t=e(t),n=e(n),a(t.translateX,t.translateY,n.translateX,n.translateY,r,i),o(t.rotate,n.rotate,r,i),s(t.skewX,n.skewX,r,i),c(t.scaleX,t.scaleY,n.scaleX,n.scaleY,r,i),t=n=null,function(e){for(var t=-1,n=i.length,a;++t<n;)r[(a=i[t]).i]=a.x(e);return r.join(``)}}}var Zr=Xr(Jr,`px, `,`px)`,`deg)`),Qr=Xr(Yr,`, `,`)`,`)`),$r=1e-12;function ei(e){return((e=Math.exp(e))+1/e)/2}function ti(e){return((e=Math.exp(e))-1/e)/2}function ni(e){return((e=Math.exp(2*e))-1)/(e+1)}var ri=(function e(t,n,r){function i(e,i){var a=e[0],o=e[1],s=e[2],c=i[0],l=i[1],u=i[2],d=c-a,f=l-o,p=d*d+f*f,m,h;if(p<$r)h=Math.log(u/s)/t,m=function(e){return[a+e*d,o+e*f,s*Math.exp(t*e*h)]};else{var g=Math.sqrt(p),_=(u*u-s*s+r*p)/(2*s*n*g),v=(u*u-s*s-r*p)/(2*u*n*g),y=Math.log(Math.sqrt(_*_+1)-_);h=(Math.log(Math.sqrt(v*v+1)-v)-y)/t,m=function(e){var r=e*h,i=ei(y),c=s/(n*g)*(i*ni(t*r+y)-ti(y));return[a+c*d,o+c*f,s*i/ei(t*r+y)]}}return m.duration=h*1e3*t/Math.SQRT2,m}return i.rho=function(t){var n=Math.max(.001,+t),r=n*n;return e(n,r,r*r)},i})(Math.SQRT2,2,4),ii=0,ai=0,oi=0,si=1e3,ci,li,ui=0,di=0,fi=0,pi=typeof performance==`object`&&performance.now?performance:Date,mi=typeof window==`object`&&window.requestAnimationFrame?window.requestAnimationFrame.bind(window):function(e){setTimeout(e,17)};function hi(){return di||=(mi(gi),pi.now()+fi)}function gi(){di=0}function _i(){this._call=this._time=this._next=null}_i.prototype=vi.prototype={constructor:_i,restart:function(e,t,n){if(typeof e!=`function`)throw TypeError(`callback is not a function`);n=(n==null?hi():+n)+(t==null?0:+t),!this._next&&li!==this&&(li?li._next=this:ci=this,li=this),this._call=e,this._time=n,Ci()},stop:function(){this._call&&(this._call=null,this._time=1/0,Ci())}};function vi(e,t,n){var r=new _i;return r.restart(e,t,n),r}function yi(){hi(),++ii;for(var e=ci,t;e;)(t=di-e._time)>=0&&e._call.call(void 0,t),e=e._next;--ii}function bi(){di=(ui=pi.now())+fi,ii=ai=0;try{yi()}finally{ii=0,Si(),di=0}}function xi(){var e=pi.now(),t=e-ui;t>si&&(fi-=t,ui=e)}function Si(){for(var e,t=ci,n,r=1/0;t;)t._call?(r>t._time&&(r=t._time),e=t,t=t._next):(n=t._next,t._next=null,t=e?e._next=n:ci=n);li=e,Ci(r)}function Ci(e){ii||(ai&&=clearTimeout(ai),e-di>24?(e<1/0&&(ai=setTimeout(bi,e-pi.now()-fi)),oi&&=clearInterval(oi)):(oi||=(ui=pi.now(),setInterval(xi,si)),ii=1,mi(bi)))}function wi(e,t,n){var r=new _i;return t=t==null?0:+t,r.restart(n=>{r.stop(),e(n+t)},t,n),r}var Ti=Se(`start`,`end`,`cancel`,`interrupt`),Ei=[];function Di(e,t,n,r,i,a){var o=e.__transition;if(!o)e.__transition={};else if(n in o)return;ji(e,n,{name:t,index:r,group:i,on:Ti,tween:Ei,time:a.time,delay:a.delay,duration:a.duration,ease:a.ease,timer:null,state:0})}function Oi(e,t){var n=Ai(e,t);if(n.state>0)throw Error(`too late; already scheduled`);return n}function ki(e,t){var n=Ai(e,t);if(n.state>3)throw Error(`too late; already running`);return n}function Ai(e,t){var n=e.__transition;if(!n||!(n=n[t]))throw Error(`transition not found`);return n}function ji(e,t,n){var r=e.__transition,i;r[t]=n,n.timer=vi(a,0,n.time);function a(e){n.state=1,n.timer.restart(o,n.delay,n.time),n.delay<=e&&o(e-n.delay)}function o(a){var l,u,d,f;if(n.state!==1)return c();for(l in r)if(f=r[l],f.name===n.name){if(f.state===3)return wi(o);f.state===4?(f.state=6,f.timer.stop(),f.on.call(`interrupt`,e,e.__data__,f.index,f.group),delete r[l]):+l<t&&(f.state=6,f.timer.stop(),f.on.call(`cancel`,e,e.__data__,f.index,f.group),delete r[l])}if(wi(function(){n.state===3&&(n.state=4,n.timer.restart(s,n.delay,n.time),s(a))}),n.state=2,n.on.call(`start`,e,e.__data__,n.index,n.group),n.state===2){for(n.state=3,i=Array(d=n.tween.length),l=0,u=-1;l<d;++l)(f=n.tween[l].value.call(e,e.__data__,n.index,n.group))&&(i[++u]=f);i.length=u+1}}function s(t){for(var r=t<n.duration?n.ease.call(null,t/n.duration):(n.timer.restart(c),n.state=5,1),a=-1,o=i.length;++a<o;)i[a].call(e,r);n.state===5&&(n.on.call(`end`,e,e.__data__,n.index,n.group),c())}function c(){for(var i in n.state=6,n.timer.stop(),delete r[t],r)return;delete e.__transition}}function Mi(e,t){var n=e.__transition,r,i,a=!0,o;if(n){for(o in t=t==null?null:t+``,n)(r=n[o]).name===t?(i=r.state>2&&r.state<5,r.state=6,r.timer.stop(),r.on.call(i?`interrupt`:`cancel`,e,e.__data__,r.index,r.group),delete n[o]):a=!1;a&&delete e.__transition}}function Ni(e){return this.each(function(){Mi(this,e)})}function Pi(e,t){var n,r;return function(){var i=ki(this,e),a=i.tween;if(a!==n){r=n=a;for(var o=0,s=r.length;o<s;++o)if(r[o].name===t){r=r.slice(),r.splice(o,1);break}}i.tween=r}}function Fi(e,t,n){var r,i;if(typeof n!=`function`)throw Error();return function(){var a=ki(this,e),o=a.tween;if(o!==r){i=(r=o).slice();for(var s={name:t,value:n},c=0,l=i.length;c<l;++c)if(i[c].name===t){i[c]=s;break}c===l&&i.push(s)}a.tween=i}}function Ii(e,t){var n=this._id;if(e+=``,arguments.length<2){for(var r=Ai(this.node(),n).tween,i=0,a=r.length,o;i<a;++i)if((o=r[i]).name===e)return o.value;return null}return this.each((t==null?Pi:Fi)(n,e,t))}function Li(e,t,n){var r=e._id;return e.each(function(){var e=ki(this,r);(e.value||={})[t]=n.apply(this,arguments)}),function(e){return Ai(e,r).value[t]}}function Ri(e,t){var n;return(typeof t==`number`?Ir:t instanceof sr?jr:(n=sr(t))?(t=n,jr):Hr)(e,t)}function zi(e){return function(){this.removeAttribute(e)}}function Bi(e){return function(){this.removeAttributeNS(e.space,e.local)}}function Vi(e,t,n){var r,i=n+``,a;return function(){var o=this.getAttribute(e);return o===i?null:o===r?a:a=t(r=o,n)}}function Hi(e,t,n){var r,i=n+``,a;return function(){var o=this.getAttributeNS(e.space,e.local);return o===i?null:o===r?a:a=t(r=o,n)}}function Ui(e,t,n){var r,i,a;return function(){var o,s=n(this),c;return s==null?void this.removeAttribute(e):(o=this.getAttribute(e),c=s+``,o===c?null:o===r&&c===i?a:(i=c,a=t(r=o,s)))}}function Wi(e,t,n){var r,i,a;return function(){var o,s=n(this),c;return s==null?void this.removeAttributeNS(e.space,e.local):(o=this.getAttributeNS(e.space,e.local),c=s+``,o===c?null:o===r&&c===i?a:(i=c,a=t(r=o,s)))}}function Gi(e,t){var n=Oe(e),r=n===`transform`?Qr:Ri;return this.attrTween(e,typeof t==`function`?(n.local?Wi:Ui)(n,r,Li(this,`attr.`+e,t)):t==null?(n.local?Bi:zi)(n):(n.local?Hi:Vi)(n,r,t))}function Ki(e,t){return function(n){this.setAttribute(e,t.call(this,n))}}function qi(e,t){return function(n){this.setAttributeNS(e.space,e.local,t.call(this,n))}}function Ji(e,t){var n,r;function i(){var i=t.apply(this,arguments);return i!==r&&(n=(r=i)&&qi(e,i)),n}return i._value=t,i}function Yi(e,t){var n,r;function i(){var i=t.apply(this,arguments);return i!==r&&(n=(r=i)&&Ki(e,i)),n}return i._value=t,i}function Xi(e,t){var n=`attr.`+e;if(arguments.length<2)return(n=this.tween(n))&&n._value;if(t==null)return this.tween(n,null);if(typeof t!=`function`)throw Error();var r=Oe(e);return this.tween(n,(r.local?Ji:Yi)(r,t))}function Zi(e,t){return function(){Oi(this,e).delay=+t.apply(this,arguments)}}function Qi(e,t){return t=+t,function(){Oi(this,e).delay=t}}function $i(e){var t=this._id;return arguments.length?this.each((typeof e==`function`?Zi:Qi)(t,e)):Ai(this.node(),t).delay}function ea(e,t){return function(){ki(this,e).duration=+t.apply(this,arguments)}}function ta(e,t){return t=+t,function(){ki(this,e).duration=t}}function na(e){var t=this._id;return arguments.length?this.each((typeof e==`function`?ea:ta)(t,e)):Ai(this.node(),t).duration}function ra(e,t){if(typeof t!=`function`)throw Error();return function(){ki(this,e).ease=t}}function V(e){var t=this._id;return arguments.length?this.each(ra(t,e)):Ai(this.node(),t).ease}function ia(e,t){return function(){var n=t.apply(this,arguments);if(typeof n!=`function`)throw Error();ki(this,e).ease=n}}function aa(e){if(typeof e!=`function`)throw Error();return this.each(ia(this._id,e))}function oa(e){typeof e!=`function`&&(e=Be(e));for(var t=this._groups,n=t.length,r=Array(n),i=0;i<n;++i)for(var a=t[i],o=a.length,s=r[i]=[],c,l=0;l<o;++l)(c=a[l])&&e.call(c,c.__data__,l,a)&&s.push(c);return new Fa(r,this._parents,this._name,this._id)}function sa(e){if(e._id!==this._id)throw Error();for(var t=this._groups,n=e._groups,r=t.length,i=n.length,a=Math.min(r,i),o=Array(r),s=0;s<a;++s)for(var c=t[s],l=n[s],u=c.length,d=o[s]=Array(u),f,p=0;p<u;++p)(f=c[p]||l[p])&&(d[p]=f);for(;s<r;++s)o[s]=t[s];return new Fa(o,this._parents,this._name,this._id)}function ca(e){return(e+``).trim().split(/^|\\s+/).every(function(e){var t=e.indexOf(`.`);return t>=0&&(e=e.slice(0,t)),!e||e===`start`})}function la(e,t,n){var r,i,a=ca(t)?Oi:ki;return function(){var o=a(this,e),s=o.on;s!==r&&(i=(r=s).copy()).on(t,n),o.on=i}}function ua(e,t){var n=this._id;return arguments.length<2?Ai(this.node(),n).on.on(e):this.each(la(n,e,t))}function da(e){return function(){var t=this.parentNode;for(var n in this.__transition)if(+n!==e)return;t&&t.removeChild(this)}}function fa(){return this.on(`end.remove`,da(this._id))}function pa(e){var t=this._name,n=this._id;typeof e!=`function`&&(e=Ne(e));for(var r=this._groups,i=r.length,a=Array(i),o=0;o<i;++o)for(var s=r[o],c=s.length,l=a[o]=Array(c),u,d,f=0;f<c;++f)(u=s[f])&&(d=e.call(u,u.__data__,f,s))&&(`__data__`in u&&(d.__data__=u.__data__),l[f]=d,Di(l[f],t,n,f,l,Ai(u,n)));return new Fa(a,this._parents,t,n)}function ma(e){var t=this._name,n=this._id;typeof e!=`function`&&(e=Le(e));for(var r=this._groups,i=r.length,a=[],o=[],s=0;s<i;++s)for(var c=r[s],l=c.length,u,d=0;d<l;++d)if(u=c[d]){for(var f=e.call(u,u.__data__,d,c),p,m=Ai(u,n),h=0,g=f.length;h<g;++h)(p=f[h])&&Di(p,t,n,h,f,m);a.push(f),o.push(u)}return new Fa(a,o,t,n)}var ha=Cn.prototype.constructor;function ga(){return new ha(this._groups,this._parents)}function _a(e,t){var n,r,i;return function(){var a=At(this,e),o=(this.style.removeProperty(e),At(this,e));return a===o?null:a===n&&o===r?i:i=t(n=a,r=o)}}function va(e){return function(){this.style.removeProperty(e)}}function ya(e,t,n){var r,i=n+``,a;return function(){var o=At(this,e);return o===i?null:o===r?a:a=t(r=o,n)}}function ba(e,t,n){var r,i,a;return function(){var o=At(this,e),s=n(this),c=s+``;return s??(c=s=(this.style.removeProperty(e),At(this,e))),o===c?null:o===r&&c===i?a:(i=c,a=t(r=o,s))}}function xa(e,t){var n,r,i,a=`style.`+t,o=`end.`+a,s;return function(){var c=ki(this,e),l=c.on,u=c.value[a]==null?s||=va(t):void 0;(l!==n||i!==u)&&(r=(n=l).copy()).on(o,i=u),c.on=r}}function Sa(e,t,n){var r=(e+=``)==`transform`?Zr:Ri;return t==null?this.styleTween(e,_a(e,r)).on(`end.style.`+e,va(e)):typeof t==`function`?this.styleTween(e,ba(e,r,Li(this,`style.`+e,t))).each(xa(this._id,e)):this.styleTween(e,ya(e,r,t),n).on(`end.style.`+e,null)}function Ca(e,t,n){return function(r){this.style.setProperty(e,t.call(this,r),n)}}function wa(e,t,n){var r,i;function a(){var a=t.apply(this,arguments);return a!==i&&(r=(i=a)&&Ca(e,a,n)),r}return a._value=t,a}function Ta(e,t,n){var r=`style.`+(e+=``);if(arguments.length<2)return(r=this.tween(r))&&r._value;if(t==null)return this.tween(r,null);if(typeof t!=`function`)throw Error();return this.tween(r,wa(e,t,n??``))}function Ea(e){return function(){this.textContent=e}}function Da(e){return function(){var t=e(this);this.textContent=t??``}}function Oa(e){return this.tween(`text`,typeof e==`function`?Da(Li(this,`text`,e)):Ea(e==null?``:e+``))}function ka(e){return function(t){this.textContent=e.call(this,t)}}function Aa(e){var t,n;function r(){var r=e.apply(this,arguments);return r!==n&&(t=(n=r)&&ka(r)),t}return r._value=e,r}function ja(e){var t=`text`;if(arguments.length<1)return(t=this.tween(t))&&t._value;if(e==null)return this.tween(t,null);if(typeof e!=`function`)throw Error();return this.tween(t,Aa(e))}function Ma(){for(var e=this._name,t=this._id,n=Ia(),r=this._groups,i=r.length,a=0;a<i;++a)for(var o=r[a],s=o.length,c,l=0;l<s;++l)if(c=o[l]){var u=Ai(c,t);Di(c,e,n,l,o,{time:u.time+u.delay+u.duration,delay:0,duration:u.duration,ease:u.ease})}return new Fa(r,this._parents,e,n)}function Na(){var e,t,n=this,r=n._id,i=n.size();return new Promise(function(a,o){var s={value:o},c={value:function(){--i===0&&a()}};n.each(function(){var n=ki(this,r),i=n.on;i!==e&&(t=(e=i).copy(),t._.cancel.push(s),t._.interrupt.push(s),t._.end.push(c)),n.on=t}),i===0&&a()})}var Pa=0;function Fa(e,t,n,r){this._groups=e,this._parents=t,this._name=n,this._id=r}function Ia(){return++Pa}var La=Cn.prototype;Fa.prototype={constructor:Fa,select:pa,selectAll:ma,selectChild:La.selectChild,selectChildren:La.selectChildren,filter:oa,merge:sa,selection:ga,transition:Ma,call:La.call,nodes:La.nodes,node:La.node,size:La.size,empty:La.empty,each:La.each,on:ua,attr:Gi,attrTween:Xi,style:Sa,styleTween:Ta,text:Oa,textTween:ja,remove:fa,tween:Ii,delay:$i,duration:na,ease:V,easeVarying:aa,end:Na,[Symbol.iterator]:La[Symbol.iterator]};function Ra(e){return((e*=2)<=1?e*e*e:(e-=2)*e*e+2)/2}var za={time:null,delay:0,duration:250,ease:Ra};function Ba(e,t){for(var n;!(n=e.__transition)||!(n=n[t]);)if(!(e=e.parentNode))throw Error(`transition ${t} not found`);return n}function Va(e){var t,n;e instanceof Fa?(t=e._id,e=e._name):(t=Ia(),(n=za).time=hi(),e=e==null?null:e+``);for(var r=this._groups,i=r.length,a=0;a<i;++a)for(var o=r[a],s=o.length,c,l=0;l<s;++l)(c=o[l])&&Di(c,e,t,l,o,n||Ba(c,t));return new Fa(r,this._parents,e,t)}Cn.prototype.interrupt=Ni,Cn.prototype.transition=Va;var Ha=e=>()=>e;function Ua(e,{sourceEvent:t,target:n,transform:r,dispatch:i}){Object.defineProperties(this,{type:{value:e,enumerable:!0,configurable:!0},sourceEvent:{value:t,enumerable:!0,configurable:!0},target:{value:n,enumerable:!0,configurable:!0},transform:{value:r,enumerable:!0,configurable:!0},_:{value:i}})}function Wa(e,t,n){this.k=e,this.x=t,this.y=n}Wa.prototype={constructor:Wa,scale:function(e){return e===1?this:new Wa(this.k*e,this.x,this.y)},translate:function(e,t){return e===0&t===0?this:new Wa(this.k,this.x+this.k*e,this.y+this.k*t)},apply:function(e){return[e[0]*this.k+this.x,e[1]*this.k+this.y]},applyX:function(e){return e*this.k+this.x},applyY:function(e){return e*this.k+this.y},invert:function(e){return[(e[0]-this.x)/this.k,(e[1]-this.y)/this.k]},invertX:function(e){return(e-this.x)/this.k},invertY:function(e){return(e-this.y)/this.k},rescaleX:function(e){return e.copy().domain(e.range().map(this.invertX,this).map(e.invert,e))},rescaleY:function(e){return e.copy().domain(e.range().map(this.invertY,this).map(e.invert,e))},toString:function(){return`translate(`+this.x+`,`+this.y+`) scale(`+this.k+`)`}};var Ga=new Wa(1,0,0);Ka.prototype=Wa.prototype;function Ka(e){for(;!e.__zoom;)if(!(e=e.parentNode))return Ga;return e.__zoom}function qa(e){e.stopImmediatePropagation()}function Ja(e){e.preventDefault(),e.stopImmediatePropagation()}function Ya(e){return(!e.ctrlKey||e.type===`wheel`)&&!e.button}function Xa(){var e=this;return e instanceof SVGElement?(e=e.ownerSVGElement||e,e.hasAttribute(`viewBox`)?(e=e.viewBox.baseVal,[[e.x,e.y],[e.x+e.width,e.y+e.height]]):[[0,0],[e.width.baseVal.value,e.height.baseVal.value]]):[[0,0],[e.clientWidth,e.clientHeight]]}function Za(){return this.__zoom||Ga}function Qa(e){return-e.deltaY*(e.deltaMode===1?.05:e.deltaMode?1:.002)*(e.ctrlKey?10:1)}function $a(){return navigator.maxTouchPoints||`ontouchstart`in this}function eo(e,t,n){var r=e.invertX(t[0][0])-n[0][0],i=e.invertX(t[1][0])-n[1][0],a=e.invertY(t[0][1])-n[0][1],o=e.invertY(t[1][1])-n[1][1];return e.translate(i>r?(r+i)/2:Math.min(0,r)||Math.max(0,i),o>a?(a+o)/2:Math.min(0,a)||Math.max(0,o))}function to(){var e=Ya,t=Xa,n=eo,r=Qa,i=$a,a=[0,1/0],o=[[-1/0,-1/0],[1/0,1/0]],s=250,c=ri,l=Se(`start`,`zoom`,`end`),u,d,f,p=500,m=150,h=0,g=10;function _(e){e.property(`__zoom`,Za).on(`wheel.zoom`,w,{passive:!1}).on(`mousedown.zoom`,T).on(`dblclick.zoom`,E).filter(i).on(`touchstart.zoom`,D).on(`touchmove.zoom`,O).on(`touchend.zoom touchcancel.zoom`,k).style(`-webkit-tap-highlight-color`,`rgba(0,0,0,0)`)}_.transform=function(e,t,n,r){var i=e.selection?e.selection():e;i.property(`__zoom`,Za),e===i?i.interrupt().each(function(){S(this,arguments).event(r).start().zoom(null,typeof t==`function`?t.apply(this,arguments):t).end()}):x(e,t,n,r)},_.scaleBy=function(e,t,n,r){_.scaleTo(e,function(){return this.__zoom.k*(typeof t==`function`?t.apply(this,arguments):t)},n,r)},_.scaleTo=function(e,r,i,a){_.transform(e,function(){var e=t.apply(this,arguments),a=this.__zoom,s=i==null?b(e):typeof i==`function`?i.apply(this,arguments):i,c=a.invert(s),l=typeof r==`function`?r.apply(this,arguments):r;return n(y(v(a,l),s,c),e,o)},i,a)},_.translateBy=function(e,r,i,a){_.transform(e,function(){return n(this.__zoom.translate(typeof r==`function`?r.apply(this,arguments):r,typeof i==`function`?i.apply(this,arguments):i),t.apply(this,arguments),o)},null,a)},_.translateTo=function(e,r,i,a,s){_.transform(e,function(){var e=t.apply(this,arguments),s=this.__zoom,c=a==null?b(e):typeof a==`function`?a.apply(this,arguments):a;return n(Ga.translate(c[0],c[1]).scale(s.k).translate(typeof r==`function`?-r.apply(this,arguments):-r,typeof i==`function`?-i.apply(this,arguments):-i),e,o)},a,s)};function v(e,t){return t=Math.max(a[0],Math.min(a[1],t)),t===e.k?e:new Wa(t,e.x,e.y)}function y(e,t,n){var r=t[0]-n[0]*e.k,i=t[1]-n[1]*e.k;return r===e.x&&i===e.y?e:new Wa(e.k,r,i)}function b(e){return[(+e[0][0]+ +e[1][0])/2,(+e[0][1]+ +e[1][1])/2]}function x(e,n,r,i){e.on(`start.zoom`,function(){S(this,arguments).event(i).start()}).on(`interrupt.zoom end.zoom`,function(){S(this,arguments).event(i).end()}).tween(`zoom`,function(){var e=this,a=arguments,o=S(e,a).event(i),s=t.apply(e,a),l=r==null?b(s):typeof r==`function`?r.apply(e,a):r,u=Math.max(s[1][0]-s[0][0],s[1][1]-s[0][1]),d=e.__zoom,f=typeof n==`function`?n.apply(e,a):n,p=c(d.invert(l).concat(u/d.k),f.invert(l).concat(u/f.k));return function(e){if(e===1)e=f;else{var t=p(e),n=u/t[2];e=new Wa(n,l[0]-t[0]*n,l[1]-t[1]*n)}o.zoom(null,e)}})}function S(e,t,n){return!n&&e.__zooming||new C(e,t)}function C(e,n){this.that=e,this.args=n,this.active=0,this.sourceEvent=null,this.extent=t.apply(e,n),this.taps=0}C.prototype={event:function(e){return e&&(this.sourceEvent=e),this},start:function(){return++this.active===1&&(this.that.__zooming=this,this.emit(`start`)),this},zoom:function(e,t){return this.mouse&&e!==`mouse`&&(this.mouse[1]=t.invert(this.mouse[0])),this.touch0&&e!==`touch`&&(this.touch0[1]=t.invert(this.touch0[0])),this.touch1&&e!==`touch`&&(this.touch1[1]=t.invert(this.touch1[0])),this.that.__zoom=t,this.emit(`zoom`),this},end:function(){return--this.active===0&&(delete this.that.__zooming,this.emit(`end`)),this},emit:function(e){var t=Tn(this.that).datum();l.call(e,this.that,new Ua(e,{sourceEvent:this.sourceEvent,target:_,type:e,transform:this.that.__zoom,dispatch:l}),t)}};function w(t,...i){if(!e.apply(this,arguments))return;var s=S(this,i).event(t),c=this.__zoom,l=Math.max(a[0],Math.min(a[1],c.k*2**r.apply(this,arguments))),u=Dn(t);if(s.wheel)(s.mouse[0][0]!==u[0]||s.mouse[0][1]!==u[1])&&(s.mouse[1]=c.invert(s.mouse[0]=u)),clearTimeout(s.wheel);else if(c.k===l)return;else s.mouse=[u,c.invert(u)],Mi(this),s.start();Ja(t),s.wheel=setTimeout(d,m),s.zoom(`mouse`,n(y(v(c,l),s.mouse[0],s.mouse[1]),s.extent,o));function d(){s.wheel=null,s.end()}}function T(t,...r){if(f||!e.apply(this,arguments))return;var i=t.currentTarget,a=S(this,r,!0).event(t),s=Tn(t.view).on(`mousemove.zoom`,d,!0).on(`mouseup.zoom`,p,!0),c=Dn(t,i),l=t.clientX,u=t.clientY;Mn(t.view),qa(t),a.mouse=[c,this.__zoom.invert(c)],Mi(this),a.start();function d(e){if(Ja(e),!a.moved){var t=e.clientX-l,r=e.clientY-u;a.moved=t*t+r*r>h}a.event(e).zoom(`mouse`,n(y(a.that.__zoom,a.mouse[0]=Dn(e,i),a.mouse[1]),a.extent,o))}function p(e){s.on(`mousemove.zoom mouseup.zoom`,null),Nn(e.view,a.moved),Ja(e),a.event(e).end()}}function E(r,...i){if(e.apply(this,arguments)){var a=this.__zoom,c=Dn(r.changedTouches?r.changedTouches[0]:r,this),l=a.invert(c),u=a.k*(r.shiftKey?.5:2),d=n(y(v(a,u),c,l),t.apply(this,i),o);Ja(r),s>0?Tn(this).transition().duration(s).call(x,d,c,r):Tn(this).call(_.transform,d,c,r)}}function D(t,...n){if(e.apply(this,arguments)){var r=t.touches,i=r.length,a=S(this,n,t.changedTouches.length===i).event(t),o,s,c,l;for(qa(t),s=0;s<i;++s)c=r[s],l=Dn(c,this),l=[l,this.__zoom.invert(l),c.identifier],a.touch0?!a.touch1&&a.touch0[2]!==l[2]&&(a.touch1=l,a.taps=0):(a.touch0=l,o=!0,a.taps=1+!!u);u&&=clearTimeout(u),o&&(a.taps<2&&(d=l[0],u=setTimeout(function(){u=null},p)),Mi(this),a.start())}}function O(e,...t){if(this.__zooming){var r=S(this,t).event(e),i=e.changedTouches,a=i.length,s,c,l,u;for(Ja(e),s=0;s<a;++s)c=i[s],l=Dn(c,this),r.touch0&&r.touch0[2]===c.identifier?r.touch0[0]=l:r.touch1&&r.touch1[2]===c.identifier&&(r.touch1[0]=l);if(c=r.that.__zoom,r.touch1){var d=r.touch0[0],f=r.touch0[1],p=r.touch1[0],m=r.touch1[1],h=(h=p[0]-d[0])*h+(h=p[1]-d[1])*h,g=(g=m[0]-f[0])*g+(g=m[1]-f[1])*g;c=v(c,Math.sqrt(h/g)),l=[(d[0]+p[0])/2,(d[1]+p[1])/2],u=[(f[0]+m[0])/2,(f[1]+m[1])/2]}else if(r.touch0)l=r.touch0[0],u=r.touch0[1];else return;r.zoom(`touch`,n(y(c,l,u),r.extent,o))}}function k(e,...t){if(this.__zooming){var n=S(this,t).event(e),r=e.changedTouches,i=r.length,a,o;for(qa(e),f&&clearTimeout(f),f=setTimeout(function(){f=null},p),a=0;a<i;++a)o=r[a],n.touch0&&n.touch0[2]===o.identifier?delete n.touch0:n.touch1&&n.touch1[2]===o.identifier&&delete n.touch1;if(n.touch1&&!n.touch0&&(n.touch0=n.touch1,delete n.touch1),n.touch0)n.touch0[1]=this.__zoom.invert(n.touch0[0]);else if(n.end(),n.taps===2&&(o=Dn(o,this),Math.hypot(d[0]-o[0],d[1]-o[1])<g)){var s=Tn(this).on(`dblclick.zoom`);s&&s.apply(this,arguments)}}}return _.wheelDelta=function(e){return arguments.length?(r=typeof e==`function`?e:Ha(+e),_):r},_.filter=function(t){return arguments.length?(e=typeof t==`function`?t:Ha(!!t),_):e},_.touchable=function(e){return arguments.length?(i=typeof e==`function`?e:Ha(!!e),_):i},_.extent=function(e){return arguments.length?(t=typeof e==`function`?e:Ha([[+e[0][0],+e[0][1]],[+e[1][0],+e[1][1]]]),_):t},_.scaleExtent=function(e){return arguments.length?(a[0]=+e[0],a[1]=+e[1],_):[a[0],a[1]]},_.translateExtent=function(e){return arguments.length?(o[0][0]=+e[0][0],o[1][0]=+e[1][0],o[0][1]=+e[0][1],o[1][1]=+e[1][1],_):[[o[0][0],o[0][1]],[o[1][0],o[1][1]]]},_.constrain=function(e){return arguments.length?(n=e,_):n},_.duration=function(e){return arguments.length?(s=+e,_):s},_.interpolate=function(e){return arguments.length?(c=e,_):c},_.on=function(){var e=l.on.apply(l,arguments);return e===l?_:e},_.clickDistance=function(e){return arguments.length?(h=(e=+e)*e,_):Math.sqrt(h)},_.tapDistance=function(e){return arguments.length?(g=+e,_):g},_}var no={error001:(e=`react`)=>`Seems like you have not used ${e===`svelte`?`SvelteFlowProvider`:`ReactFlowProvider`} as an ancestor. Help: https://${e}flow.dev/error#001`,error002:()=>`It looks like you\'ve created a new nodeTypes or edgeTypes object. If this wasn\'t on purpose please define the nodeTypes/edgeTypes outside of the component or memoize them.`,error003:e=>`Node type "${e}" not found. Using fallback type "default".`,error004:()=>`The parent container needs a width and a height to render the graph.`,error005:()=>`Only child nodes can use a parent extent.`,error006:()=>`Can\'t create edge. An edge needs a source and a target.`,error007:e=>`The old edge with id=${e} does not exist.`,error009:e=>`Marker type "${e}" doesn\'t exist.`,error008:(e,{id:t,sourceHandle:n,targetHandle:r})=>`Couldn\'t create edge for ${e} handle id: "${e===`source`?n:r}", edge id: ${t}.`,error010:()=>`Handle: No node id found. Make sure to only use a Handle inside a custom Node.`,error011:e=>`Edge type "${e}" not found. Using fallback type "default".`,error012:e=>`Node with id "${e}" does not exist, it may have been removed. This can happen when a node is deleted before the "onNodeClick" handler is called.`,error013:(e=`react`)=>`It seems that you haven\'t loaded the styles. Please import \'@xyflow/${e}/dist/style.css\' or base.css to make sure everything is working properly.`,error014:()=>`useNodeConnections: No node ID found. Call useNodeConnections inside a custom Node or provide a node ID.`,error015:()=>`It seems that you are trying to drag a node that is not initialized. Please use onNodesChange as explained in the docs.`,error016:e=>`Edge with id "${e}" does not exist, it may have been removed. This can happen when an edge is deleted before the "onEdgeClick" handler is called.`},ro=[[-1/0,-1/0],[1/0,1/0]],io=[`Enter`,` `,`Escape`],ao={"node.a11yDescription.default":`Press enter or space to select a node. Press delete to remove it and escape to cancel.`,"node.a11yDescription.keyboardDisabled":`Press enter or space to select a node. You can then use the arrow keys to move the node around. Press delete to remove it and escape to cancel.`,"node.a11yDescription.ariaLiveMessage":({direction:e,x:t,y:n})=>`Moved selected node ${e}. New position, x: ${t}, y: ${n}`,"edge.a11yDescription.default":`Press enter or space to select an edge. You can then press delete to remove it or escape to cancel.`,"controls.ariaLabel":`Control Panel`,"controls.zoomIn.ariaLabel":`Zoom In`,"controls.zoomOut.ariaLabel":`Zoom Out`,"controls.fitView.ariaLabel":`Fit View`,"controls.interactive.ariaLabel":`Toggle Interactivity`,"minimap.ariaLabel":`Mini Map`,"handle.ariaLabel":`Handle`},oo;(function(e){e.Strict=`strict`,e.Loose=`loose`})(oo||={});var so;(function(e){e.Free=`free`,e.Vertical=`vertical`,e.Horizontal=`horizontal`})(so||={});var co;(function(e){e.Partial=`partial`,e.Full=`full`})(co||={});var lo={inProgress:!1,isValid:null,from:null,fromHandle:null,fromPosition:null,fromNode:null,to:null,toHandle:null,toPosition:null,toNode:null,pointer:null},uo;(function(e){e.Bezier=`default`,e.Straight=`straight`,e.Step=`step`,e.SmoothStep=`smoothstep`,e.SimpleBezier=`simplebezier`})(uo||={});var fo;(function(e){e.Arrow=`arrow`,e.ArrowClosed=`arrowclosed`})(fo||={});var H;(function(e){e.Left=`left`,e.Top=`top`,e.Right=`right`,e.Bottom=`bottom`})(H||={});var po={[H.Left]:H.Right,[H.Right]:H.Left,[H.Top]:H.Bottom,[H.Bottom]:H.Top},mo=e=>!!e&&typeof e==`object`&&`id`in e&&`source`in e&&`target`in e,ho=e=>!!e&&typeof e==`object`&&`id`in e&&`position`in e&&!(`source`in e)&&!(`target`in e),go=e=>!!e&&typeof e==`object`&&`id`in e&&`internals`in e&&!(`source`in e)&&!(`target`in e),_o=(e,t=[0,0])=>{let{width:n,height:r}=G(e),i=e.origin??t,a=n*i[0],o=r*i[1];return{x:e.position.x-a,y:e.position.y-o}},vo=(e,t={nodeOrigin:[0,0]})=>{if(e.length===0)return{x:0,y:0,width:0,height:0};let n=!1,r=e.reduce((e,r)=>{let i=typeof r==`string`,a=!t.nodeLookup&&!i?r:void 0;return t.nodeLookup&&(a=i?t.nodeLookup.get(r):go(r)?r:t.nodeLookup.get(r.id)),a?(n=!0,jo(e,Fo(a,t.nodeOrigin))):e},{x:1/0,y:1/0,x2:-1/0,y2:-1/0});return n?No(r):{x:0,y:0,width:0,height:0}},yo=(e,t={})=>{let n={x:1/0,y:1/0,x2:-1/0,y2:-1/0},r=!1;return e.forEach(e=>{(t.filter===void 0||t.filter(e))&&(n=jo(n,Fo(e)),r=!0)}),r?No(n):{x:0,y:0,width:0,height:0}},bo=(e,t,[n,r,i]=[0,0,1],a=!1,o=!1)=>{let s=(t.x-n)/i,c=(t.y-r)/i,l=t.width/i,u=t.height/i,d=[];for(let t of e.values()){let{measured:e,selectable:n=!0,hidden:r=!1}=t;if(o&&!n||r)continue;let i=e.width??t.width??t.initialWidth??0,f=e.height??t.height??t.initialHeight??0,{x:p,y:m}=t.internals.positionAbsolute,h=Lo(s,c,l,u,p,m,i,f),g=i*f,_=a&&h>0;(!t.internals.handleBounds||_||h>=g||t.dragging)&&d.push(t)}return d},xo=(e,t)=>{let n=new Set;return e.forEach(e=>{n.add(e.id)}),t.filter(e=>n.has(e.source)||n.has(e.target))};function So(e,t){let n=new Map,r=t?.nodes?new Set(t.nodes.map(e=>e.id)):null;return e.forEach(e=>{let i;if(t?.includeHiddenNodes){let{width:t,height:n}=G(e);i=t>0&&n>0}else i=!!(e.measured.width&&e.measured.height&&!e.hidden);i&&(!r||r.has(e.id))&&n.set(e.id,e)}),n}async function Co({nodes:e,width:t,height:n,panZoom:r,minZoom:i,maxZoom:a},o){if(e.size===0)return!0;let s=Ko(yo(So(e,o)),t,n,o?.minZoom??i,o?.maxZoom??a,o?.padding??.1);return await r.setViewport(s,{duration:o?.duration,ease:o?.ease,interpolate:o?.interpolate}),!0}function wo({nodeId:e,nextPosition:t,nodeLookup:n,nodeOrigin:r=[0,0],nodeExtent:i,onError:a}){let o=n.get(e),s=o.parentId?n.get(o.parentId):void 0,{x:c,y:l}=s?s.internals.positionAbsolute:{x:0,y:0},u=o.origin??r,d=o.extent||i;if(o.extent===`parent`&&!o.expandParent){if(!s)a?.(`005`,no.error005());else{let{width:e,height:t}=G(s);e&&t&&(d=[[c,l],[c+e,l+t]])}}else s&&Jo(o.extent)&&(d=[[o.extent[0][0]+c,o.extent[0][1]+l],[o.extent[1][0]+c,o.extent[1][1]+l]]);let f=Jo(d)?Do(t,d,o.measured):t;return(o.measured.width===void 0||o.measured.height===void 0)&&a?.(`015`,no.error015()),{position:{x:f.x-c+(o.measured.width??0)*u[0],y:f.y-l+(o.measured.height??0)*u[1]},positionAbsolute:f}}async function To({nodesToRemove:e=[],edgesToRemove:t=[],nodes:n,edges:r,onBeforeDelete:i}){let a=new Set(e.map(e=>e.id)),o=[];for(let e of n){if(e.deletable===!1)continue;let t=a.has(e.id),n=!t&&e.parentId&&o.find(t=>t.id===e.parentId);(t||n)&&o.push(e)}let s=new Set(t.map(e=>e.id)),c=r.filter(e=>e.deletable!==!1),l=xo(o,c);for(let e of c)s.has(e.id)&&!l.find(t=>t.id===e.id)&&l.push(e);if(!i)return{edges:l,nodes:o};let u=await i({nodes:o,edges:l});return typeof u==`boolean`?u?{edges:l,nodes:o}:{edges:[],nodes:[]}:u}var Eo=(e,t=0,n=1)=>Math.min(Math.max(e,t),n),Do=(e={x:0,y:0},t,n)=>({x:Eo(e.x,t[0][0],t[1][0]-(n?.width??0)),y:Eo(e.y,t[0][1],t[1][1]-(n?.height??0))});function Oo(e,t,n){let{width:r,height:i}=G(n),{x:a,y:o}=n.internals.positionAbsolute;return Do(e,[[a,o],[a+r,o+i]],t)}var ko=(e,t,n)=>e<t?Eo(Math.abs(e-t),1,t)/t:e>n?-Eo(Math.abs(e-n),1,t)/t:0,Ao=(e,t,n=15,r=40)=>[ko(e.x,r,t.width-r)*n,ko(e.y,r,t.height-r)*n],jo=(e,t)=>({x:Math.min(e.x,t.x),y:Math.min(e.y,t.y),x2:Math.max(e.x2,t.x2),y2:Math.max(e.y2,t.y2)}),Mo=({x:e,y:t,width:n,height:r})=>({x:e,y:t,x2:e+n,y2:t+r}),No=({x:e,y:t,x2:n,y2:r})=>({x:e,y:t,width:n-e,height:r-t}),Po=(e,t=[0,0])=>{let{x:n,y:r}=go(e)?e.internals.positionAbsolute:_o(e,t);return{x:n,y:r,width:e.measured?.width??e.width??e.initialWidth??0,height:e.measured?.height??e.height??e.initialHeight??0}},Fo=(e,t=[0,0])=>{let{x:n,y:r}=go(e)?e.internals.positionAbsolute:_o(e,t);return{x:n,y:r,x2:n+(e.measured?.width??e.width??e.initialWidth??0),y2:r+(e.measured?.height??e.height??e.initialHeight??0)}},Io=(e,t)=>No(jo(Mo(e),Mo(t))),Lo=(e,t,n,r,i,a,o,s)=>{let c=Math.max(0,Math.min(e+n,i+o)-Math.max(e,i)),l=Math.max(0,Math.min(t+r,a+s)-Math.max(t,a));return Math.ceil(c*l)},Ro=(e,t)=>Lo(e.x,e.y,e.width,e.height,t.x,t.y,t.width,t.height),zo=e=>Bo(e.width)&&Bo(e.height)&&Bo(e.x)&&Bo(e.y),Bo=e=>!isNaN(e)&&isFinite(e),U=(e,t)=>(e,t)=>{},W=(e,t=[1,1])=>({x:t[0]*Math.round(e.x/t[0]),y:t[1]*Math.round(e.y/t[1])}),Vo=({x:e,y:t},[n,r,i],a=!1,o=[1,1])=>{let s={x:(e-n)/i,y:(t-r)/i};return a?W(s,o):s},Ho=({x:e,y:t},[n,r,i])=>({x:e*i+n,y:t*i+r});function Uo(e,t){if(typeof e==`number`)return Math.floor((t-t/(1+e))*.5);if(typeof e==`string`&&e.endsWith(`px`)){let t=parseFloat(e);if(!Number.isNaN(t))return Math.floor(t)}if(typeof e==`string`&&e.endsWith(`%`)){let n=parseFloat(e);if(!Number.isNaN(n))return Math.floor(t*n*.01)}return console.error(`The padding value "${e}" is invalid. Please provide a number or a string with a valid unit (px or %).`),0}function Wo(e,t,n){if(typeof e==`string`||typeof e==`number`){let r=Uo(e,n),i=Uo(e,t);return{top:r,right:i,bottom:r,left:i,x:i*2,y:r*2}}if(typeof e==`object`){let r=Uo(e.top??e.y??0,n),i=Uo(e.bottom??e.y??0,n),a=Uo(e.left??e.x??0,t),o=Uo(e.right??e.x??0,t);return{top:r,right:o,bottom:i,left:a,x:a+o,y:r+i}}return{top:0,right:0,bottom:0,left:0,x:0,y:0}}function Go(e,t,n,r,i,a){let{x:o,y:s}=Ho(e,[t,n,r]),{x:c,y:l}=Ho({x:e.x+e.width,y:e.y+e.height},[t,n,r]),u=i-c,d=a-l;return{left:Math.floor(o),top:Math.floor(s),right:Math.floor(u),bottom:Math.floor(d)}}var Ko=(e,t,n,r,i,a)=>{let o=Wo(a,t,n),s=(t-o.x)/e.width,c=(n-o.y)/e.height,l=Eo(Math.min(s,c),r,i),u=e.x+e.width/2,d=e.y+e.height/2,f=t/2-u*l,p=n/2-d*l,m=Go(e,f,p,l,t,n),h={left:Math.min(m.left-o.left,0),top:Math.min(m.top-o.top,0),right:Math.min(m.right-o.right,0),bottom:Math.min(m.bottom-o.bottom,0)};return{x:f-h.left+h.right,y:p-h.top+h.bottom,zoom:l}},qo=()=>typeof navigator<`u`&&navigator?.userAgent?.indexOf(`Mac`)>=0;function Jo(e){return e!=null&&e!==`parent`}function G(e){return{width:e.measured?.width??e.width??e.initialWidth??0,height:e.measured?.height??e.height??e.initialHeight??0}}function Yo(e){return(e.measured?.width??e.width??e.initialWidth)!==void 0&&(e.measured?.height??e.height??e.initialHeight)!==void 0}function Xo(e,t={width:0,height:0},n,r,i){let a={...e},o=r.get(n);if(o){let e=o.origin||i;a.x+=o.internals.positionAbsolute.x-(t.width??0)*e[0],a.y+=o.internals.positionAbsolute.y-(t.height??0)*e[1]}return a}function Zo(e,t){if(e.size!==t.size)return!1;for(let n of e)if(!t.has(n))return!1;return!0}function Qo(){let e,t;return{promise:new Promise((n,r)=>{e=n,t=r}),resolve:e,reject:t}}function $o(e){return{...ao,...e||{}}}function es(e){return e===null?null:e?`valid`:`invalid`}function ts(e,{snapGrid:t=[0,0],snapToGrid:n=!1,transform:r,containerBounds:i}){let{x:a,y:o}=ss(e),s=Vo({x:a-(i?.left??0),y:o-(i?.top??0)},r),{x:c,y:l}=n?W(s,t):s;return{xSnapped:c,ySnapped:l,...s}}var ns=e=>({width:e.offsetWidth,height:e.offsetHeight}),rs=e=>e?.getRootNode?.()||window?.document,is=[`INPUT`,`SELECT`,`TEXTAREA`];function as(e){let t=e.composedPath?.()?.[0]||e.target;return t?.nodeType===1?is.includes(t.nodeName)||t.hasAttribute(`contenteditable`)||!!t.closest(`.nokey`):!1}var os=e=>`clientX`in e,ss=(e,t)=>{let n=os(e),r=n?e.clientX:e.touches?.[0].clientX,i=n?e.clientY:e.touches?.[0].clientY;return{x:r-(t?.left??0),y:i-(t?.top??0)}},cs=(e,t,n,r,i)=>{let a=t.querySelectorAll(`.${e}`);return!a||!a.length?null:Array.from(a).map(t=>{let a=t.getBoundingClientRect();return{id:t.getAttribute(`data-handleid`),type:e,nodeId:i,position:t.getAttribute(`data-handlepos`),x:(a.left-n.left)/r,y:(a.top-n.top)/r,...ns(t)}})};function ls({sourceX:e,sourceY:t,targetX:n,targetY:r,sourceControlX:i,sourceControlY:a,targetControlX:o,targetControlY:s}){let c=e*.125+i*.375+o*.375+n*.125,l=t*.125+a*.375+s*.375+r*.125;return[c,l,Math.abs(c-e),Math.abs(l-t)]}function us(e,t){return e>=0?.5*e:t*25*Math.sqrt(-e)}function ds({pos:e,x1:t,y1:n,x2:r,y2:i,c:a}){switch(e){case H.Left:return[t-us(t-r,a),n];case H.Right:return[t+us(r-t,a),n];case H.Top:return[t,n-us(n-i,a)];case H.Bottom:return[t,n+us(i-n,a)]}}function fs({sourceX:e,sourceY:t,sourcePosition:n=H.Bottom,targetX:r,targetY:i,targetPosition:a=H.Top,curvature:o=.25}){let[s,c]=ds({pos:n,x1:e,y1:t,x2:r,y2:i,c:o}),[l,u]=ds({pos:a,x1:r,y1:i,x2:e,y2:t,c:o}),[d,f,p,m]=ls({sourceX:e,sourceY:t,targetX:r,targetY:i,sourceControlX:s,sourceControlY:c,targetControlX:l,targetControlY:u});return[`M${e},${t} C${s},${c} ${l},${u} ${r},${i}`,d,f,p,m]}function ps({sourceX:e,sourceY:t,targetX:n,targetY:r}){let i=Math.abs(n-e)/2,a=n<e?n+i:n-i,o=Math.abs(r-t)/2;return[a,r<t?r+o:r-o,i,o]}function ms({sourceNode:e,targetNode:t,selected:n=!1,zIndex:r=0,elevateOnSelect:i=!1,zIndexMode:a=`basic`}){return a===`manual`?r:(i&&n?r+1e3:r)+Math.max(e.parentId||i&&e.selected?e.internals.z:0,t.parentId||i&&t.selected?t.internals.z:0)}function hs({sourceNode:e,targetNode:t,width:n,height:r,transform:i}){let a=jo(Fo(e),Fo(t));return a.x===a.x2&&(a.x2+=1),a.y===a.y2&&(a.y2+=1),Ro({x:-i[0]/i[2],y:-i[1]/i[2],width:n/i[2],height:r/i[2]},No(a))>0}var gs=({source:e,sourceHandle:t,target:n,targetHandle:r})=>`xy-edge__${e}${t||``}-${n}${r||``}`,_s=(e,t)=>t.some(t=>t.source===e.source&&t.target===e.target&&(t.sourceHandle===e.sourceHandle||!t.sourceHandle&&!e.sourceHandle)&&(t.targetHandle===e.targetHandle||!t.targetHandle&&!e.targetHandle)),vs=(e,t,n={})=>{if(!e.source||!e.target)return n.onError?.(`006`,no.error006()),t;let r=n.getEdgeId||gs,i;return i=mo(e)?{...e}:{...e,id:r(e)},_s(i,t)?t:(i.sourceHandle===null&&delete i.sourceHandle,i.targetHandle===null&&delete i.targetHandle,t.concat(i))};function ys({sourceX:e,sourceY:t,targetX:n,targetY:r}){let[i,a,o,s]=ps({sourceX:e,sourceY:t,targetX:n,targetY:r});return[`M ${e},${t}L ${n},${r}`,i,a,o,s]}var bs={[H.Left]:{x:-1,y:0},[H.Right]:{x:1,y:0},[H.Top]:{x:0,y:-1},[H.Bottom]:{x:0,y:1}},xs=({source:e,sourcePosition:t=H.Bottom,target:n})=>t===H.Left||t===H.Right?e.x<n.x?{x:1,y:0}:{x:-1,y:0}:e.y<n.y?{x:0,y:1}:{x:0,y:-1},Ss=(e,t)=>Math.sqrt((t.x-e.x)**2+(t.y-e.y)**2);function Cs({source:e,sourcePosition:t=H.Bottom,target:n,targetPosition:r=H.Top,center:i,offset:a,stepPosition:o}){let s=bs[t],c=bs[r],l={x:e.x+s.x*a,y:e.y+s.y*a},u={x:n.x+c.x*a,y:n.y+c.y*a},d=xs({source:l,sourcePosition:t,target:u}),f=d.x===0?`y`:`x`,p=d[f],m=[],h,g,_={x:0,y:0},v={x:0,y:0},[,,y,b]=ps({sourceX:e.x,sourceY:e.y,targetX:n.x,targetY:n.y});if(s[f]*c[f]===-1){f===`x`?(h=i.x??l.x+(u.x-l.x)*o,g=i.y??(l.y+u.y)/2):(h=i.x??(l.x+u.x)/2,g=i.y??l.y+(u.y-l.y)*o);let e=[{x:h,y:l.y},{x:h,y:u.y}],t=[{x:l.x,y:g},{x:u.x,y:g}];m=s[f]===p?f===`x`?e:t:f===`x`?t:e}else{let i=[{x:l.x,y:u.y}],o=[{x:u.x,y:l.y}];if(m=f===`x`?s.x===p?o:i:s.y===p?i:o,t===r){let t=Math.abs(e[f]-n[f]);if(t<=a){let r=Math.min(a-1,a-t);s[f]===p?_[f]=(l[f]>e[f]?-1:1)*r:v[f]=(u[f]>n[f]?-1:1)*r}}if(t!==r){let e=f===`x`?`y`:`x`,t=s[f]===c[e],n=l[e]>u[e],r=l[e]<u[e];(s[f]===1&&(!t&&n||t&&r)||s[f]!==1&&(!t&&r||t&&n))&&(m=f===`x`?i:o)}let d={x:l.x+_.x,y:l.y+_.y},y={x:u.x+v.x,y:u.y+v.y};Math.max(Math.abs(d.x-m[0].x),Math.abs(y.x-m[0].x))>=Math.max(Math.abs(d.y-m[0].y),Math.abs(y.y-m[0].y))?(h=(d.x+y.x)/2,g=m[0].y):(h=m[0].x,g=(d.y+y.y)/2)}let x={x:l.x+_.x,y:l.y+_.y},S={x:u.x+v.x,y:u.y+v.y};return[[e,...x.x!==m[0].x||x.y!==m[0].y?[x]:[],...m,...S.x!==m[m.length-1].x||S.y!==m[m.length-1].y?[S]:[],n],h,g,y,b]}function ws(e,t,n,r){let i=Math.min(Ss(e,t)/2,Ss(t,n)/2,r),{x:a,y:o}=t;if(e.x===a&&a===n.x||e.y===o&&o===n.y)return`L${a} ${o}`;if(e.y===o){let t=e.x<n.x?-1:1,r=e.y<n.y?1:-1;return`L ${a+i*t},${o}Q ${a},${o} ${a},${o+i*r}`}let s=e.x<n.x?1:-1;return`L ${a},${o+i*(e.y<n.y?-1:1)}Q ${a},${o} ${a+i*s},${o}`}function Ts({sourceX:e,sourceY:t,sourcePosition:n=H.Bottom,targetX:r,targetY:i,targetPosition:a=H.Top,borderRadius:o=5,centerX:s,centerY:c,offset:l=20,stepPosition:u=.5}){let[d,f,p,m,h]=Cs({source:{x:e,y:t},sourcePosition:n,target:{x:r,y:i},targetPosition:a,center:{x:s,y:c},offset:l,stepPosition:u}),g=`M${d[0].x} ${d[0].y}`;for(let e=1;e<d.length-1;e++)g+=ws(d[e-1],d[e],d[e+1],o);return g+=`L${d[d.length-1].x} ${d[d.length-1].y}`,[g,f,p,m,h]}function Es(e){return e&&!!(e.internals.handleBounds||e.handles?.length)&&!!(e.measured.width||e.width||e.initialWidth)}function Ds(e){let{sourceNode:t,targetNode:n}=e;if(!Es(t)||!Es(n))return null;let r=t.internals.handleBounds||Os(t.handles),i=n.internals.handleBounds||Os(n.handles),a=As(r?.source??[],e.sourceHandle),o=As(e.connectionMode===oo.Strict?i?.target??[]:(i?.target??[]).concat(i?.source??[]),e.targetHandle);if(!a||!o)return e.onError?.(`008`,no.error008(a?`target`:`source`,{id:e.id,sourceHandle:e.sourceHandle,targetHandle:e.targetHandle})),null;let s=a?.position||H.Bottom,c=o?.position||H.Top,l=ks(t,a,s),u=ks(n,o,c);return{sourceX:l.x,sourceY:l.y,targetX:u.x,targetY:u.y,sourcePosition:s,targetPosition:c}}function Os(e){if(!e)return null;let t=[],n=[];for(let r of e)r.width=r.width??1,r.height=r.height??1,r.type===`source`?t.push(r):r.type===`target`&&n.push(r);return{source:t,target:n}}function ks(e,t,n=H.Left,r=!1){let i=(t?.x??0)+e.internals.positionAbsolute.x,a=(t?.y??0)+e.internals.positionAbsolute.y,{width:o,height:s}=t??G(e);if(r)return{x:i+o/2,y:a+s/2};switch(t?.position??n){case H.Top:return{x:i+o/2,y:a};case H.Right:return{x:i+o,y:a+s/2};case H.Bottom:return{x:i+o/2,y:a+s};case H.Left:return{x:i,y:a+s/2}}}function As(e,t){return e&&(t?e.find(e=>e.id===t):e[0])||null}function js(e,t){return e?typeof e==`string`?e:`${t?`${t}__`:``}${Object.keys(e).sort().map(t=>`${t}=${e[t]}`).join(`&`)}`:``}function Ms(e,{id:t,defaultColor:n,defaultMarkerStart:r,defaultMarkerEnd:i}){let a=new Set;return e.reduce((e,o)=>([o.markerStart||r,o.markerEnd||i].forEach(r=>{if(r&&typeof r==`object`){let i=js(r,t);a.has(i)||(e.push({id:i,color:r.color||n,...r}),a.add(i))}}),e),[]).sort((e,t)=>e.id.localeCompare(t.id))}var Ns=1e3,Ps=10,Fs={nodeOrigin:[0,0],nodeExtent:ro,elevateNodesOnSelect:!0,zIndexMode:`basic`,defaults:{}},Is={...Fs,checkEquality:!0};function Ls(e,t){let n={...e};for(let e in t)t[e]!==void 0&&(n[e]=t[e]);return n}function Rs(e,t,n){let r=Ls(Fs,n);for(let n of e.values())if(n.parentId)Us(n,e,t,r);else{let e=Do(_o(n,r.nodeOrigin),Jo(n.extent)?n.extent:r.nodeExtent,G(n));n.internals.positionAbsolute=e}}function zs(e,t){if(!e.handles)return e.measured?t?.internals.handleBounds:void 0;let n=[],r=[];for(let t of e.handles){let i={id:t.id,width:t.width??1,height:t.height??1,nodeId:e.id,x:t.x,y:t.y,position:t.position,type:t.type};t.type===`source`?n.push(i):t.type===`target`&&r.push(i)}return{source:n,target:r}}function Bs(e){return e===`manual`}function Vs(e,t,n,r={}){let i=Ls(Is,r),a={i:0},o=new Map(t),s=i?.elevateNodesOnSelect&&!Bs(i.zIndexMode)?Ns:0,c=e.length>0,l=!1;t.clear(),n.clear();for(let u of e){let e=o.get(u.id);if(i.checkEquality&&u===e?.internals.userNode)t.set(u.id,e);else{let n=Do(_o(u,i.nodeOrigin),Jo(u.extent)?u.extent:i.nodeExtent,G(u));e={...i.defaults,...u,measured:{width:u.measured?.width,height:u.measured?.height},internals:{positionAbsolute:n,handleBounds:zs(u,e),z:Ws(u,s,i.zIndexMode),userNode:u}},t.set(u.id,e)}e.measured!==void 0&&e.measured.width!==void 0&&e.measured.height!==void 0||e.hidden||(c=!1),u.parentId&&Us(e,t,n,r,a),l||=u.selected??!1}return{nodesInitialized:c,hasSelectedNodes:l}}function Hs(e,t){if(!e.parentId)return;let n=t.get(e.parentId);n?n.set(e.id,e):t.set(e.parentId,new Map([[e.id,e]]))}function Us(e,t,n,r,i){let{elevateNodesOnSelect:a,nodeOrigin:o,nodeExtent:s,zIndexMode:c}=Ls(Fs,r),l=e.parentId,u=t.get(l);if(!u){console.warn(`Parent node ${l} not found. Please make sure that parent nodes are in front of their child nodes in the nodes array.`);return}Hs(e,n),i&&!u.parentId&&u.internals.rootParentIndex===void 0&&c===`auto`&&(u.internals.rootParentIndex=++i.i,u.internals.z=u.internals.z+i.i*Ps),i&&u.internals.rootParentIndex!==void 0&&(i.i=u.internals.rootParentIndex);let{x:d,y:f,z:p}=Gs(e,u,o,s,a&&!Bs(c)?Ns:0,c),{positionAbsolute:m}=e.internals,h=d!==m.x||f!==m.y;(h||p!==e.internals.z)&&t.set(e.id,{...e,internals:{...e.internals,positionAbsolute:h?{x:d,y:f}:m,z:p}})}function Ws(e,t,n){let r=Bo(e.zIndex)?e.zIndex:0;return Bs(n)?r:r+(e.selected?t:0)}function Gs(e,t,n,r,i,a){let{x:o,y:s}=t.internals.positionAbsolute,c=G(e),l=_o(e,n),u=Jo(e.extent)?Do(l,e.extent,c):l,d=Do({x:o+u.x,y:s+u.y},r,c);e.extent===`parent`&&(d=Oo(d,c,t));let f=Ws(e,i,a),p=t.internals.z??0;return{x:d.x,y:d.y,z:p>=f?p+1:f}}function Ks(e,t,n,r=[0,0]){let i=[],a=new Map;for(let n of e){let e=t.get(n.parentId);if(!e)continue;let r=Io(a.get(n.parentId)?.expandedRect??Po(e),n.rect);a.set(n.parentId,{expandedRect:r,parent:e})}return a.size>0&&a.forEach(({expandedRect:t,parent:a},o)=>{let s=a.internals.positionAbsolute,c=G(a),l=a.origin??r,u=t.x<s.x?Math.round(Math.abs(s.x-t.x)):0,d=t.y<s.y?Math.round(Math.abs(s.y-t.y)):0,f=Math.max(c.width,Math.round(t.width)),p=Math.max(c.height,Math.round(t.height)),m=(f-c.width)*l[0],h=(p-c.height)*l[1];(u>0||d>0||m||h)&&(i.push({id:o,type:`position`,position:{x:a.position.x-u+m,y:a.position.y-d+h}}),n.get(o)?.forEach(t=>{e.some(e=>e.id===t.id)||i.push({id:t.id,type:`position`,position:{x:t.position.x+u,y:t.position.y+d}})})),(c.width<t.width||c.height<t.height||u||d)&&i.push({id:o,type:`dimensions`,setAttributes:!0,dimensions:{width:f+(u?l[0]*u-m:0),height:p+(d?l[1]*d-h:0)}})}),i}function qs(e,t,n,r,i,a,o){let s=r?.querySelector(`.xyflow__viewport`),c=!1;if(!s)return{changes:[],updatedInternals:c};let l=[],u=window.getComputedStyle(s),{m22:d}=new window.DOMMatrixReadOnly(u.transform),f=[];for(let r of e.values()){let e=t.get(r.id);if(!e)continue;if(e.hidden){t.set(e.id,{...e,internals:{...e.internals,handleBounds:void 0}}),c=!0;continue}let s=ns(r.nodeElement),u=e.measured.width!==s.width||e.measured.height!==s.height;if(s.width&&s.height&&(u||!e.internals.handleBounds||r.force)){let p=r.nodeElement.getBoundingClientRect(),m=Jo(e.extent)?e.extent:a,{positionAbsolute:h}=e.internals;if(e.parentId&&e.extent===`parent`){let n=t.get(e.parentId);n&&(h=Oo(h,s,n))}else m&&(h=Do(h,m,s));let g={...e,measured:s,internals:{...e.internals,positionAbsolute:h,handleBounds:{source:cs(`source`,r.nodeElement,p,d,e.id),target:cs(`target`,r.nodeElement,p,d,e.id)}}};t.set(e.id,g),e.parentId&&Us(g,t,n,{nodeOrigin:i,zIndexMode:o}),c=!0,u&&(l.push({id:e.id,type:`dimensions`,dimensions:s}),e.expandParent&&e.parentId&&f.push({id:e.id,parentId:e.parentId,rect:Po(g,i)}))}}if(f.length>0){let e=Ks(f,t,n,i);l.push(...e)}return{changes:l,updatedInternals:c}}async function Js({delta:e,panZoom:t,transform:n,translateExtent:r,width:i,height:a}){if(!t||!e.x&&!e.y)return!1;let o=await t.setViewportConstrained({x:n[0]+e.x,y:n[1]+e.y,zoom:n[2]},[[0,0],[i,a]],r);return!!o&&(o.x!==n[0]||o.y!==n[1]||o.k!==n[2])}function Ys(e,t,n,r,i,a){let o=i,s=r.get(o)||new Map;r.set(o,s.set(n,t)),o=`${i}-${e}`;let c=r.get(o)||new Map;if(r.set(o,c.set(n,t)),a){o=`${i}-${e}-${a}`;let s=r.get(o)||new Map;r.set(o,s.set(n,t))}}function Xs(e,t,n){e.clear(),t.clear();for(let r of n){let{source:n,target:i,sourceHandle:a=null,targetHandle:o=null}=r,s={edgeId:r.id,source:n,target:i,sourceHandle:a,targetHandle:o},c=`${n}-${a}--${i}-${o}`;Ys(`source`,s,`${i}-${o}--${n}-${a}`,e,n,a),Ys(`target`,s,c,e,i,o),t.set(r.id,r)}}function Zs(e,t){if(!e.parentId)return!1;let n=t.get(e.parentId);return n?n.selected?!0:Zs(n,t):!1}function Qs(e,t,n){let r=e;do{if(r?.matches?.(t))return!0;if(r===n)return!1;r=r?.parentElement}while(r);return!1}function $s(e,t,n,r){let i=new Map;for(let[a,o]of e)if((o.selected||o.id===r)&&(!o.parentId||!Zs(o,e))&&(o.draggable||t&&o.draggable===void 0)){let t=e.get(a);t&&i.set(a,{id:a,position:t.position||{x:0,y:0},distance:{x:n.x-t.internals.positionAbsolute.x,y:n.y-t.internals.positionAbsolute.y},extent:t.extent,parentId:t.parentId,origin:t.origin,expandParent:t.expandParent,internals:{positionAbsolute:t.internals.positionAbsolute||{x:0,y:0}},measured:{width:t.measured.width??0,height:t.measured.height??0}})}return i}function ec({nodeId:e,dragItems:t,nodeLookup:n,dragging:r=!0}){let i=[];for(let[e,a]of t){let t=n.get(e)?.internals.userNode;t&&i.push({...t,position:a.position,dragging:r})}if(!e)return[i[0],i];let a=n.get(e)?.internals.userNode;return[a?{...a,position:t.get(e)?.position||a.position,dragging:r}:i[0],i]}function tc({dragItems:e,snapGrid:t,x:n,y:r}){let i=e.values().next().value;if(!i)return null;let a={x:n-i.distance.x,y:r-i.distance.y},o=W(a,t);return{x:o.x-a.x,y:o.y-a.y}}function nc({onNodeMouseDown:e,getStoreItems:t,onDragStart:n,onDrag:r,onDragStop:i}){let a={x:null,y:null},o=0,s=new Map,c=!1,l={x:0,y:0},u=null,d=!1,f=null,p=!1,m=!1,h=null;function g({noDragClassName:g,handleSelector:_,domNode:v,isSelectable:y,nodeId:b,nodeClickDistance:x=0}){f=Tn(v);function S({x:e,y:n}){let{nodeLookup:i,nodeExtent:o,snapGrid:c,snapToGrid:l,nodeOrigin:u,onNodeDrag:d,onSelectionDrag:f,onError:p,updateNodePositions:g}=t();a={x:e,y:n};let _=!1,v=s.size>1,y=v&&o?Mo(yo(s)):null,x=v&&l?tc({dragItems:s,snapGrid:c,x:e,y:n}):null;for(let[t,r]of s){if(!i.has(t))continue;let a={x:e-r.distance.x,y:n-r.distance.y};l&&(a=x?{x:Math.round(a.x+x.x),y:Math.round(a.y+x.y)}:W(a,c));let s=null;if(v&&o&&!r.extent&&y){let{positionAbsolute:e}=r.internals,t=e.x-y.x+o[0][0],n=e.x+r.measured.width-y.x2+o[1][0],i=e.y-y.y+o[0][1],a=e.y+r.measured.height-y.y2+o[1][1];s=[[t,i],[n,a]]}let{position:d,positionAbsolute:f}=wo({nodeId:t,nextPosition:a,nodeLookup:i,nodeExtent:s||o,nodeOrigin:u,onError:p});_=_||r.position.x!==d.x||r.position.y!==d.y,r.position=d,r.internals.positionAbsolute=f}if(m||=_,_&&(g(s,!0),h&&(r||d||!b&&f))){let[e,t]=ec({nodeId:b,dragItems:s,nodeLookup:i});r?.(h,s,e,t),d?.(h,e,t),b||f?.(h,t)}}async function C(){if(!u)return;let{transform:e,panBy:n,autoPanSpeed:r,autoPanOnNodeDrag:i}=t();if(!i){c=!1,cancelAnimationFrame(o);return}let[s,d]=Ao(l,u,r);(s!==0||d!==0)&&(a.x=(a.x??0)-s/e[2],a.y=(a.y??0)-d/e[2],await n({x:s,y:d})&&S(a)),o=requestAnimationFrame(C)}function w(r){let{nodeLookup:i,multiSelectionActive:o,nodesDraggable:c,transform:l,snapGrid:f,snapToGrid:p,selectNodesOnDrag:m,onNodeDragStart:h,onSelectionDragStart:g,unselectNodesAndEdges:_}=t();d=!0,m&&y||o||!b||i.get(b)?.selected||_(),y&&m&&b&&e?.(b);let v=ts(r.sourceEvent,{transform:l,snapGrid:f,snapToGrid:p,containerBounds:u});if(a=v,s=$s(i,c,v,b),s.size>0&&(n||h||!b&&g)){let[e,t]=ec({nodeId:b,dragItems:s,nodeLookup:i});n?.(r.sourceEvent,s,e,t),h?.(r.sourceEvent,e,t),b||g?.(r.sourceEvent,t)}}let T=Bn().clickDistance(x).on(`start`,e=>{let{domNode:n,nodeDragThreshold:r,transform:i,snapGrid:o,snapToGrid:s}=t();u=n?.getBoundingClientRect()||null,p=!1,m=!1,h=e.sourceEvent,r===0&&w(e),a=ts(e.sourceEvent,{transform:i,snapGrid:o,snapToGrid:s,containerBounds:u}),l=ss(e.sourceEvent,u)}).on(`drag`,e=>{let{autoPanOnNodeDrag:n,transform:r,snapGrid:i,snapToGrid:o,nodeDragThreshold:f,nodeLookup:m}=t(),g=ts(e.sourceEvent,{transform:r,snapGrid:i,snapToGrid:o,containerBounds:u});if(h=e.sourceEvent,(e.sourceEvent.type===`touchmove`&&e.sourceEvent.touches.length>1||b&&!m.has(b))&&(p=!0),!p){if(!c&&n&&d&&(c=!0,C()),!d){let t=ss(e.sourceEvent,u),n=t.x-l.x,r=t.y-l.y;Math.sqrt(n*n+r*r)>f&&w(e)}(a.x!==g.xSnapped||a.y!==g.ySnapped)&&s&&d&&(l=ss(e.sourceEvent,u),S(g))}}).on(`end`,e=>{if(!d||p)p&&s.size>0&&t().updateNodePositions(s,!1);else if(c=!1,d=!1,cancelAnimationFrame(o),s.size>0){let{nodeLookup:n,updateNodePositions:r,onNodeDragStop:a,onSelectionDragStop:o}=t();if(m&&=(r(s,!1),!1),i||a||!b&&o){let[t,r]=ec({nodeId:b,dragItems:s,nodeLookup:n,dragging:!1});i?.(e.sourceEvent,s,t,r),a?.(e.sourceEvent,t,r),b||o?.(e.sourceEvent,r)}}}).filter(e=>{let t=e.target;return!e.button&&(!g||!Qs(t,`.${g}`,v))&&(!_||Qs(t,_,v))});f.call(T)}function _(){f?.on(`.drag`,null)}return{update:g,destroy:_}}function rc(e,t,n){let r=[],i={x:e.x-n,y:e.y-n,width:n*2,height:n*2};for(let e of t.values())Ro(i,Po(e))>0&&r.push(e);return r}var ic=250;function ac(e,t,n,r){let i=[],a=1/0,o=rc(e,n,t+ic);for(let n of o){let o=[...n.internals.handleBounds?.source??[],...n.internals.handleBounds?.target??[]];for(let s of o){if(r.nodeId===s.nodeId&&r.type===s.type&&r.id===s.id)continue;let{x:o,y:c}=ks(n,s,s.position,!0),l=Math.sqrt((o-e.x)**2+(c-e.y)**2);l>t||(l<a?(i=[{...s,x:o,y:c}],a=l):l===a&&i.push({...s,x:o,y:c}))}}if(!i.length)return null;if(i.length>1){let e=r.type===`source`?`target`:`source`;return i.find(t=>t.type===e)??i[0]}return i[0]}function oc(e,t,n,r,i,a=!1){let o=r.get(e);if(!o)return null;let s=i===`strict`?o.internals.handleBounds?.[t]:[...o.internals.handleBounds?.source??[],...o.internals.handleBounds?.target??[]],c=(n?s?.find(e=>e.id===n):s?.[0])??null;return c&&a?{...c,...ks(o,c,c.position,!0)}:c}function sc(e,t){return e||(t?.classList.contains(`target`)?`target`:t?.classList.contains(`source`)?`source`:null)}function cc(e,t){let n=null;return t?n=!0:e&&!t&&(n=!1),n}var lc=()=>!0;function uc(e,{connectionMode:t,connectionRadius:n,handleId:r,nodeId:i,edgeUpdaterType:a,isTarget:o,domNode:s,nodeLookup:c,lib:l,autoPanOnConnect:u,flowId:d,panBy:f,cancelConnection:p,onConnectStart:m,onConnect:h,onConnectEnd:g,isValidConnection:_=lc,onReconnectEnd:v,updateConnection:y,getTransform:b,getFromHandle:x,autoPanSpeed:S,dragThreshold:C=1,handleDomNode:w}){let T=rs(e.target),E=0,D,{x:O,y:k}=ss(e),A=sc(a,w),j=s?.getBoundingClientRect(),ee=!1;if(!j||!A)return;let te=oc(i,A,r,c,t);if(!te)return;let M=ss(e,j),N=!1,ne=null,re=!1,ie=null;function P(){if(!u||!j)return;let[e,t]=Ao(M,j,S);f({x:e,y:t}),E=requestAnimationFrame(P)}let ae={...te,nodeId:i,type:A,position:te.position},oe=c.get(i),se={inProgress:!0,isValid:null,from:ks(oe,ae,H.Left,!0),fromHandle:ae,fromPosition:ae.position,fromNode:oe,to:M,toHandle:null,toPosition:po[ae.position],toNode:null,pointer:M};function ce(){ee=!0,y(se),m?.(e,{nodeId:i,handleId:r,handleType:A})}C===0&&ce();function le(e){if(!ee){let{x:t,y:n}=ss(e),r=t-O,i=n-k;if(!(r*r+i*i>C*C))return;ce()}if(!x()||!ae){ue(e);return}let a=b();M=ss(e,j),D=ac(Vo(M,a,!1,[1,1]),n,c,ae),N||=(P(),!0);let s=dc(e,{handle:D,connectionMode:t,fromNodeId:i,fromHandleId:r,fromType:o?`target`:`source`,isValidConnection:_,doc:T,lib:l,flowId:d,nodeLookup:c});ie=s.handleDomNode,ne=s.connection,re=cc(!!D,s.isValid);let u=c.get(i),f=u?ks(u,ae,H.Left,!0):se.from,p={...se,from:f,isValid:re,to:s.toHandle&&re?Ho({x:s.toHandle.x,y:s.toHandle.y},a):M,toHandle:s.toHandle,toPosition:re&&s.toHandle?s.toHandle.position:po[ae.position],toNode:s.toHandle?c.get(s.toHandle.nodeId):null,pointer:M};y(p),se=p}function ue(e){if(!(`touches`in e&&e.touches.length>0)){if(ee){(D||ie)&&ne&&re&&h?.(ne);let{inProgress:t,...n}=se,r={...n,toPosition:se.toHandle?se.toPosition:null};g?.(e,r),a&&v?.(e,r)}p(),cancelAnimationFrame(E),N=!1,re=!1,ne=null,ie=null,T.removeEventListener(`mousemove`,le),T.removeEventListener(`mouseup`,ue),T.removeEventListener(`touchmove`,le),T.removeEventListener(`touchend`,ue)}}T.addEventListener(`mousemove`,le),T.addEventListener(`mouseup`,ue),T.addEventListener(`touchmove`,le),T.addEventListener(`touchend`,ue)}function dc(e,{handle:t,connectionMode:n,fromNodeId:r,fromHandleId:i,fromType:a,doc:o,lib:s,flowId:c,isValidConnection:l=lc,nodeLookup:u}){let d=a===`target`,f=t?o.querySelector(`.${s}-flow__handle[data-id="${c}-${t?.nodeId}-${t?.id}-${t?.type}"]`):null,{x:p,y:m}=ss(e),h=o.elementFromPoint(p,m),g=h?.classList.contains(`${s}-flow__handle`)?h:f,_={handleDomNode:g,isValid:!1,connection:null,toHandle:null};if(g){let e=sc(void 0,g),t=g.getAttribute(`data-nodeid`),a=g.getAttribute(`data-handleid`),o=g.classList.contains(`connectable`),s=g.classList.contains(`connectableend`);if(!t||!e)return _;let c={source:d?t:r,sourceHandle:d?a:i,target:d?r:t,targetHandle:d?i:a};_.connection=c,_.isValid=o&&s&&(n===oo.Strict?d&&e===`source`||!d&&e===`target`:t!==r||a!==i)&&l(c),_.toHandle=oc(t,e,a,u,n,!0)}return _}var fc={onPointerDown:uc,isValid:dc};function pc({domNode:e,panZoom:t,getTransform:n,getViewScale:r}){let i=Tn(e);function a({translateExtent:e,width:a,height:o,zoomStep:s=1,pannable:c=!0,zoomable:l=!0,inversePan:u=!1}){let d=e=>{if(e.sourceEvent.type!==`wheel`||!t)return;let r=n(),i=e.sourceEvent.ctrlKey&&qo()?10:1,a=-e.sourceEvent.deltaY*(e.sourceEvent.deltaMode===1?.05:e.sourceEvent.deltaMode?1:.002)*s,o=r[2]*2**(a*i);t.scaleTo(o)},f=[0,0],p=to().on(`start`,e=>{(e.sourceEvent.type===`mousedown`||e.sourceEvent.type===`touchstart`)&&(f=[e.sourceEvent.clientX??e.sourceEvent.touches[0].clientX,e.sourceEvent.clientY??e.sourceEvent.touches[0].clientY])}).on(`zoom`,c?i=>{let s=n();if(i.sourceEvent.type!==`mousemove`&&i.sourceEvent.type!==`touchmove`||!t)return;let c=[i.sourceEvent.clientX??i.sourceEvent.touches[0].clientX,i.sourceEvent.clientY??i.sourceEvent.touches[0].clientY],l=[c[0]-f[0],c[1]-f[1]];f=c;let d=r()*Math.max(s[2],Math.log(s[2]))*(u?-1:1),p={x:s[0]-l[0]*d,y:s[1]-l[1]*d},m=[[0,0],[a,o]];t.setViewportConstrained({x:p.x,y:p.y,zoom:s[2]},m,e)}:null).on(`zoom.wheel`,l?d:null);i.call(p,{})}function o(){i.on(`zoom`,null)}return{update:a,destroy:o,pointer:Dn}}var mc=e=>({x:e.x,y:e.y,zoom:e.k}),hc=({x:e,y:t,zoom:n})=>Ga.translate(e,t).scale(n),gc=(e,t)=>e.target.closest(`.${t}`),_c=(e,t)=>t===2&&Array.isArray(e)&&e.includes(2),vc=e=>((e*=2)<=1?e*e*e:(e-=2)*e*e+2)/2,yc=(e,t=0,n=vc,r=()=>{})=>{let i=typeof t==`number`&&t>0;return i||r(),i?e.transition().duration(t).ease(n).on(`end`,r):e},bc=e=>{let t=e.ctrlKey&&qo()?10:1;return-e.deltaY*(e.deltaMode===1?.05:e.deltaMode?1:.002)*t};function xc({zoomPanValues:e,noWheelClassName:t,d3Selection:n,d3Zoom:r,panOnScrollMode:i,panOnScrollSpeed:a,zoomOnPinch:o,onPanZoomStart:s,onPanZoom:c,onPanZoomEnd:l}){return u=>{if(gc(u,t))return u.ctrlKey&&u.preventDefault(),!1;u.preventDefault(),u.stopImmediatePropagation();let d=n.property(`__zoom`).k||1;if(u.ctrlKey&&o){let e=Dn(u),t=d*2**bc(u);r.scaleTo(n,t,e,u);return}let f=u.deltaMode===1?20:1,p=i===so.Vertical?0:u.deltaX*f,m=i===so.Horizontal?0:u.deltaY*f;!qo()&&u.shiftKey&&i!==so.Vertical&&(p=u.deltaY*f,m=0),r.translateBy(n,-(p/d)*a,-(m/d)*a,{internal:!0});let h=mc(n.property(`__zoom`));clearTimeout(e.panScrollTimeout),e.isPanScrolling?c?.(u,h):(e.isPanScrolling=!0,s?.(u,h)),e.panScrollTimeout=setTimeout(()=>{l?.(u,h),e.isPanScrolling=!1},150)}}function Sc({noWheelClassName:e,preventScrolling:t,d3ZoomHandler:n}){return function(r,i){let a=r.type===`wheel`,o=!t&&a&&!r.ctrlKey,s=gc(r,e);if(r.ctrlKey&&a&&s&&r.preventDefault(),o||s)return null;r.preventDefault(),n.call(this,r,i)}}function Cc({zoomPanValues:e,onDraggingChange:t,onPanZoomStart:n}){return r=>{if(r.sourceEvent?.internal)return;let i=mc(r.transform);e.mouseButton=r.sourceEvent?.button||0,e.isZoomingOrPanning=!0,e.prevViewport=i,r.sourceEvent?.type===`mousedown`&&t(!0),n&&n?.(r.sourceEvent,i)}}function wc({zoomPanValues:e,panOnDrag:t,onPaneContextMenu:n,onTransformChange:r,onPanZoom:i}){return a=>{e.usedRightMouseButton=!!(n&&_c(t,e.mouseButton??0)),a.sourceEvent?.sync||r([a.transform.x,a.transform.y,a.transform.k]),i&&!a.sourceEvent?.internal&&i?.(a.sourceEvent,mc(a.transform))}}function Tc({zoomPanValues:e,panOnDrag:t,panOnScroll:n,onDraggingChange:r,onPanZoomEnd:i,onPaneContextMenu:a}){return o=>{if(!o.sourceEvent?.internal&&(e.isZoomingOrPanning=!1,a&&_c(t,e.mouseButton??0)&&!e.usedRightMouseButton&&o.sourceEvent&&a(o.sourceEvent),e.usedRightMouseButton=!1,r(!1),i)){let t=mc(o.transform);e.prevViewport=t,clearTimeout(e.timerId),e.timerId=setTimeout(()=>{i?.(o.sourceEvent,t)},n?150:0)}}}function Ec({panActivationKeyPressed:e,zoomActivationKeyPressed:t,zoomOnScroll:n,zoomOnPinch:r,panOnDrag:i,panOnScroll:a,zoomOnDoubleClick:o,userSelectionActive:s,noWheelClassName:c,noPanClassName:l,lib:u,connectionInProgress:d}){return f=>{let p=t||n,m=r&&f.ctrlKey,h=f.type===`wheel`;if(f.button===1&&f.type===`mousedown`&&(gc(f,`${u}-flow__node`)||gc(f,`${u}-flow__edge`)||gc(f,`${u}-flow__selection`)||gc(f,`${u}-flow__nodesselection`)))return!0;if(!i&&!p&&!a&&!o&&!r||s||d&&!h||gc(f,c)&&h||gc(f,l)&&(!h||a&&h&&!t)||!r&&f.ctrlKey&&h)return!1;if(!r&&f.type===`touchstart`&&f.touches?.length>1)return f.preventDefault(),!1;if(!p&&!a&&!m&&h||!i&&(f.type===`mousedown`||f.type===`touchstart`)||Array.isArray(i)&&!i.includes(f.button)&&f.type===`mousedown`)return!1;let g=Array.isArray(i)&&i.includes(f.button)||!f.button||f.button<=1;return(!f.ctrlKey||h||e)&&g}}function Dc({domNode:e,minZoom:t,maxZoom:n,translateExtent:r,viewport:i,onPanZoom:a,onPanZoomStart:o,onPanZoomEnd:s,onDraggingChange:c}){let l={isZoomingOrPanning:!1,usedRightMouseButton:!1,prevViewport:{},mouseButton:0,timerId:void 0,panScrollTimeout:void 0,isPanScrolling:!1},u=e.getBoundingClientRect(),d=[[0,0],[u.width,u.height]];(typeof ResizeObserver<`u`?new ResizeObserver(e=>{let t=e[0];t&&(d=[[0,0],[t.contentRect.width,t.contentRect.height]])}):null)?.observe(e);let f=to().extent(()=>d).scaleExtent([t,n]).translateExtent(r),p=Tn(e).call(f);y({x:i.x,y:i.y,zoom:Eo(i.zoom,t,n)},[[0,0],[u.width,u.height]],r);let m=p.on(`wheel.zoom`),h=p.on(`dblclick.zoom`);f.wheelDelta(bc);async function g(e,t){return p?new Promise(n=>{f?.interpolate(t?.interpolate===`linear`?Ur:ri).transform(yc(p,t?.duration,t?.ease,()=>n(!0)),e)}):!1}function _({noWheelClassName:e,noPanClassName:t,onPaneContextMenu:n,userSelectionActive:r,panOnScroll:i,panOnDrag:u,panOnScrollMode:d,panOnScrollSpeed:g,preventScrolling:_,zoomOnPinch:y,zoomOnScroll:b,zoomOnDoubleClick:x,panActivationKeyPressed:S=!1,zoomActivationKeyPressed:C,lib:w,onTransformChange:T,connectionInProgress:E,paneClickDistance:D,selectionOnDrag:O}){r&&!l.isZoomingOrPanning&&v();let k=i&&!C&&!r;f.clickDistance(O?1/0:!Bo(D)||D<0?0:D);let A=k?xc({zoomPanValues:l,noWheelClassName:e,d3Selection:p,d3Zoom:f,panOnScrollMode:d,panOnScrollSpeed:g,zoomOnPinch:y,onPanZoomStart:o,onPanZoom:a,onPanZoomEnd:s}):Sc({noWheelClassName:e,preventScrolling:_,d3ZoomHandler:m});p.on(`wheel.zoom`,A,{passive:!1});let j=Cc({zoomPanValues:l,onDraggingChange:c,onPanZoomStart:o});f.on(`start`,j);let ee=wc({zoomPanValues:l,panOnDrag:u,onPaneContextMenu:!!n,onPanZoom:a,onTransformChange:T});f.on(`zoom`,ee);let te=Tc({zoomPanValues:l,panOnDrag:u,panOnScroll:i,onPaneContextMenu:n,onPanZoomEnd:s,onDraggingChange:c});f.on(`end`,te);let M=Ec({panActivationKeyPressed:S,zoomActivationKeyPressed:C,panOnDrag:u,zoomOnScroll:b,panOnScroll:i,zoomOnDoubleClick:x,zoomOnPinch:y,userSelectionActive:r,noPanClassName:t,noWheelClassName:e,lib:w,connectionInProgress:E});f.filter(M),x?p.on(`dblclick.zoom`,h):p.on(`dblclick.zoom`,null)}function v(){f.on(`zoom`,null)}async function y(e,t,n){let r=hc(e),i=f?.constrain()(r,t,n);return i&&await g(i),i}async function b(e,t){let n=hc(e);return await g(n,t),n}function x(e){if(p){let t=hc(e),n=p.property(`__zoom`);(n.k!==e.zoom||n.x!==e.x||n.y!==e.y)&&f?.transform(p,t,null,{sync:!0})}}function S(){let e=p?Ka(p.node()):{x:0,y:0,k:1};return{x:e.x,y:e.y,zoom:e.k}}async function C(e,t){return p?new Promise(n=>{f?.interpolate(t?.interpolate===`linear`?Ur:ri).scaleTo(yc(p,t?.duration,t?.ease,()=>n(!0)),e)}):!1}async function w(e,t){return p?new Promise(n=>{f?.interpolate(t?.interpolate===`linear`?Ur:ri).scaleBy(yc(p,t?.duration,t?.ease,()=>n(!0)),e)}):!1}function T(e){f?.scaleExtent(e)}function E(e){f?.translateExtent(e)}function D(e){let t=!Bo(e)||e<0?0:e;f?.clickDistance(t)}return{update:_,destroy:v,setViewport:b,setViewportConstrained:y,getViewport:S,scaleTo:C,scaleBy:w,setScaleExtent:T,setTranslateExtent:E,syncViewport:x,setClickDistance:D}}var Oc;(function(e){e.Line=`line`,e.Handle=`handle`})(Oc||={});function kc({width:e,prevWidth:t,height:n,prevHeight:r,affectsX:i,affectsY:a}){let o=e-t,s=n-r,c=[o>0?1:o<0?-1:0,s>0?1:s<0?-1:0];return o&&i&&(c[0]*=-1),s&&a&&(c[1]*=-1),c}function Ac(e){return{isHorizontal:e.includes(`right`)||e.includes(`left`),isVertical:e.includes(`bottom`)||e.includes(`top`),affectsX:e.includes(`left`),affectsY:e.includes(`top`)}}function jc(e,t){return Math.max(0,t-e)}function Mc(e,t){return Math.max(0,e-t)}function Nc(e,t,n){return Math.max(0,t-e,e-n)}function Pc(e,t){return e?!t:t}function Fc(e,t,n,r,i,a,o,s){let{affectsX:c,affectsY:l}=t,{isHorizontal:u,isVertical:d}=t,f=u&&d,{xSnapped:p,ySnapped:m}=n,{minWidth:h,maxWidth:g,minHeight:_,maxHeight:v}=r,{x:y,y:b,width:x,height:S,aspectRatio:C}=e,w=Math.floor(u?p-e.pointerX:0),T=Math.floor(d?m-e.pointerY:0),E=x+(c?-w:w),D=S+(l?-T:T),O=-a[0]*x,k=-a[1]*S,A=Nc(E,h,g),j=Nc(D,_,v);if(o){let e=0,t=0;c&&w<0?e=jc(y+w+O,o[0][0]):!c&&w>0&&(e=Mc(y+E+O,o[1][0])),l&&T<0?t=jc(b+T+k,o[0][1]):!l&&T>0&&(t=Mc(b+D+k,o[1][1])),A=Math.max(A,e),j=Math.max(j,t)}if(s){let e=0,t=0;c&&w>0?e=Mc(y+w,s[0][0]):!c&&w<0&&(e=jc(y+E,s[1][0])),l&&T>0?t=Mc(b+T,s[0][1]):!l&&T<0&&(t=jc(b+D,s[1][1])),A=Math.max(A,e),j=Math.max(j,t)}if(i){if(u){let e=Nc(E/C,_,v)*C;if(A=Math.max(A,e),o){let e=0;e=!c&&!l||c&&!l&&f?Mc(b+k+E/C,o[1][1])*C:jc(b+k+(c?w:-w)/C,o[0][1])*C,A=Math.max(A,e)}if(s){let e=0;e=!c&&!l||c&&!l&&f?jc(b+E/C,s[1][1])*C:Mc(b+(c?w:-w)/C,s[0][1])*C,A=Math.max(A,e)}}if(d){let e=Nc(D*C,h,g)/C;if(j=Math.max(j,e),o){let e=0;e=!c&&!l||l&&!c&&f?Mc(y+D*C+O,o[1][0])/C:jc(y+(l?T:-T)*C+O,o[0][0])/C,j=Math.max(j,e)}if(s){let e=0;e=!c&&!l||l&&!c&&f?jc(y+D*C,s[1][0])/C:Mc(y+(l?T:-T)*C,s[0][0])/C,j=Math.max(j,e)}}}T+=T<0?j:-j,w+=w<0?A:-A,i&&(f?E>D*C?T=(Pc(c,l)?-w:w)/C:w=(Pc(c,l)?-T:T)*C:u?(T=w/C,l=c):(w=T*C,c=l));let ee=c?y+w:y,te=l?b+T:b;return{width:x+(c?-w:w),height:S+(l?-T:T),x:a[0]*w*(c?-1:1)+ee,y:a[1]*T*(l?-1:1)+te}}var Ic={width:0,height:0,x:0,y:0},Lc={...Ic,pointerX:0,pointerY:0,aspectRatio:1};function Rc(e,t,n){let r=t.position.x+e.position.x,i=t.position.y+e.position.y,a=e.measured.width??0,o=e.measured.height??0,s=n[0]*a,c=n[1]*o;return[[r-s,i-c],[r+a-s,i+o-c]]}function zc({domNode:e,nodeId:t,getStoreItems:n,onChange:r,onEnd:i}){let a=Tn(e),o={controlDirection:Ac(`bottom-right`),boundaries:{minWidth:0,minHeight:0,maxWidth:Number.MAX_VALUE,maxHeight:Number.MAX_VALUE},resizeDirection:void 0,keepAspectRatio:!1};function s({controlPosition:e,boundaries:s,keepAspectRatio:c,resizeDirection:l,onResizeStart:u,onResize:d,onResizeEnd:f,shouldResize:p}){let m={...Ic},h={...Lc};o={boundaries:s,resizeDirection:l,keepAspectRatio:c,controlDirection:Ac(e)};let g,_=null,v=[],y,b,x,S=Bn().on(`start`,e=>{let{nodeLookup:r,transform:i,snapGrid:a,snapToGrid:o,nodeOrigin:s,paneDomNode:c}=n();if(g=r.get(t),!g)return;_=c?.getBoundingClientRect()??null;let{xSnapped:l,ySnapped:d}=ts(e.sourceEvent,{transform:i,snapGrid:a,snapToGrid:o,containerBounds:_});m={width:g.measured.width??0,height:g.measured.height??0,x:g.position.x??0,y:g.position.y??0},h={...m,pointerX:l,pointerY:d,aspectRatio:m.width/m.height},y=void 0,b=Jo(g.extent)?g.extent:void 0,g.parentId&&(g.extent===`parent`||g.expandParent)&&(y=r.get(g.parentId)),y&&g.extent===`parent`&&(b=[[0,0],[y.measured.width,y.measured.height]]),v=[],x=void 0;for(let[e,n]of r)if(n.parentId===t&&(v.push({id:e,position:{...n.position},extent:n.extent}),n.extent===`parent`||n.expandParent)){let e=Rc(n,g,n.origin??s);x=x?[[Math.min(e[0][0],x[0][0]),Math.min(e[0][1],x[0][1])],[Math.max(e[1][0],x[1][0]),Math.max(e[1][1],x[1][1])]]:e}u?.(e,{...m})}).on(`drag`,e=>{let{transform:t,snapGrid:i,snapToGrid:a,nodeOrigin:s}=n(),c=ts(e.sourceEvent,{transform:t,snapGrid:i,snapToGrid:a,containerBounds:_}),l=[];if(!g)return;let{x:u,y:f,width:S,height:C}=m,w={},T=g.origin??s,{width:E,height:D,x:O,y:k}=Fc(h,o.controlDirection,c,o.boundaries,o.keepAspectRatio,T,b,x),A=E!==S,j=D!==C,ee=O!==u&&A,te=k!==f&&j;if(!ee&&!te&&!A&&!j)return;let M={prevValues:{...m},startX:h.x,startY:h.y,childNodes:v.map(e=>({...e,position:{...e.position}}))};if((ee||te||T[0]===1||T[1]===1)&&(w.x=ee?O:m.x,w.y=te?k:m.y,m.x=w.x,m.y=w.y,v.length>0)){let e=O-u,t=k-f;for(let n of v)n.position={x:n.position.x-e+T[0]*(E-S),y:n.position.y-t+T[1]*(D-C)},l.push(n)}if((A||j)&&(w.width=A&&(!o.resizeDirection||o.resizeDirection===`horizontal`)?E:m.width,w.height=j&&(!o.resizeDirection||o.resizeDirection===`vertical`)?D:m.height,m.width=w.width,m.height=w.height),y&&g.expandParent){let e=T[0]*(w.width??0);w.x&&w.x<e&&(m.x=e,h.x-=w.x-e);let t=T[1]*(w.height??0);w.y&&w.y<t&&(m.y=t,h.y-=w.y-t)}let N=kc({width:m.width,prevWidth:S,height:m.height,prevHeight:C,affectsX:o.controlDirection.affectsX,affectsY:o.controlDirection.affectsY}),ne={...m,direction:N};p?.(e,ne)===!1?(m=M.prevValues,h.x=M.startX,h.y=M.startY,v.forEach((e,t)=>{e.position=M.childNodes[t].position})):(d?.(e,ne),r(w,l))}).on(`end`,e=>{f?.(e,{...m}),i?.({...m})});a.call(S)}function c(){a.on(`.drag`,null)}return{update:s,destroy:c}}var Bc=o((e=>{var t=u();function n(e,t){return e===t&&(e!==0||1/e==1/t)||e!==e&&t!==t}var r=typeof Object.is==`function`?Object.is:n,i=t.useState,a=t.useEffect,o=t.useLayoutEffect,s=t.useDebugValue;function c(e,t){var n=t(),r=i({inst:{value:n,getSnapshot:t}}),c=r[0].inst,u=r[1];return o(function(){c.value=n,c.getSnapshot=t,l(c)&&u({inst:c})},[e,n,t]),a(function(){return l(c)&&u({inst:c}),e(function(){l(c)&&u({inst:c})})},[e]),s(n),n}function l(e){var t=e.getSnapshot;e=e.value;try{var n=t();return!r(e,n)}catch{return!0}}function d(e,t){return t()}var f=typeof window>`u`||window.document===void 0||window.document.createElement===void 0?d:c;e.useSyncExternalStore=t.useSyncExternalStore===void 0?f:t.useSyncExternalStore})),Vc=o(((e,t)=>{t.exports=Bc()})),Hc=o((e=>{var t=u(),n=Vc();function r(e,t){return e===t&&(e!==0||1/e==1/t)||e!==e&&t!==t}var i=typeof Object.is==`function`?Object.is:r,a=n.useSyncExternalStore,o=t.useRef,s=t.useEffect,c=t.useMemo,l=t.useDebugValue;e.useSyncExternalStoreWithSelector=function(e,t,n,r,u){var d=o(null);if(d.current===null){var f={hasValue:!1,value:null};d.current=f}else f=d.current;d=c(function(){function e(e){if(!a){if(a=!0,o=e,e=r(e),u!==void 0&&f.hasValue){var t=f.value;if(u(t,e))return s=t}return s=e}if(t=s,i(o,e))return t;var n=r(e);return u!==void 0&&u(t,n)?(o=e,t):(o=e,s=n)}var a=!1,o,s,c=n===void 0?null:n;return[function(){return e(t())},c===null?void 0:function(){return e(c())}]},[t,n,r,u]);var p=a(e,d[0],d[1]);return s(function(){f.hasValue=!0,f.value=p},[p]),l(p),p}})),Uc=c(o(((e,t)=>{t.exports=Hc()}))(),1),Wc=e=>{let t,n=new Set,r=(e,r)=>{let i=typeof e==`function`?e(t):e;if(!Object.is(i,t)){let e=t;t=r??(typeof i!=`object`||!i)?i:Object.assign({},t,i),n.forEach(n=>n(t,e))}},i=()=>t,a={setState:r,getState:i,getInitialState:()=>o,subscribe:e=>(n.add(e),()=>n.delete(e)),destroy:()=>{n.clear()}},o=t=e(r,i,a);return a},Gc=e=>e?Wc(e):Wc,{useDebugValue:Kc}=_.default,{useSyncExternalStoreWithSelector:qc}=Uc.default,Jc=e=>e;function Yc(e,t=Jc,n){let r=qc(e.subscribe,e.getState,e.getServerState||e.getInitialState,t,n);return Kc(r),r}var Xc=(e,t)=>{let n=Gc(e),r=(e,r=t)=>Yc(n,e,r);return Object.assign(r,n),r},Zc=(e,t)=>e?Xc(e,t):Xc;function Qc(e,t){if(Object.is(e,t))return!0;if(typeof e!=`object`||!e||typeof t!=`object`||!t)return!1;if(e instanceof Map&&t instanceof Map){if(e.size!==t.size)return!1;for(let[n,r]of e)if(!Object.is(r,t.get(n)))return!1;return!0}if(e instanceof Set&&t instanceof Set){if(e.size!==t.size)return!1;for(let n of e)if(!t.has(n))return!1;return!0}let n=Object.keys(e);if(n.length!==Object.keys(t).length)return!1;for(let r of n)if(!Object.prototype.hasOwnProperty.call(t,r)||!Object.is(e[r],t[r]))return!1;return!0}m();var $c=(0,_.createContext)(null),el=$c.Provider,tl=no.error001(`react`);function K(e,t){let n=(0,_.useContext)($c);if(n===null)throw Error(tl);return Yc(n,e,t)}function nl(){let e=(0,_.useContext)($c);if(e===null)throw Error(tl);return(0,_.useMemo)(()=>({getState:e.getState,setState:e.setState,subscribe:e.subscribe}),[e])}var rl={display:`none`},il={position:`absolute`,width:1,height:1,margin:-1,border:0,padding:0,overflow:`hidden`,clip:`rect(0px, 0px, 0px, 0px)`,clipPath:`inset(100%)`},al=`react-flow__node-desc`,ol=`react-flow__edge-desc`,sl=`react-flow__aria-live`,cl=e=>e.ariaLiveMessage,ll=e=>e.ariaLabelConfig;function ul({rfId:e}){let t=K(cl);return(0,L.jsx)(`div`,{id:`${sl}-${e}`,"aria-live":`assertive`,"aria-atomic":`true`,style:il,children:t})}function dl({rfId:e,disableKeyboardA11y:t}){let n=K(ll);return(0,L.jsxs)(L.Fragment,{children:[(0,L.jsx)(`div`,{id:`${al}-${e}`,style:rl,children:t?n[`node.a11yDescription.default`]:n[`node.a11yDescription.keyboardDisabled`]}),(0,L.jsx)(`div`,{id:`${ol}-${e}`,style:rl,children:n[`edge.a11yDescription.default`]}),!t&&(0,L.jsx)(ul,{rfId:e})]})}var fl=(0,_.forwardRef)(({position:e=`top-left`,children:t,className:n,style:r,...i},a)=>{let o=`${e}`.split(`-`);return(0,L.jsx)(`div`,{className:z([`react-flow__panel`,n,...o]),style:r,ref:a,...i,children:t})});fl.displayName=`Panel`;var pl=`https://reactflow.dev?utm_source=attribution`;function ml({proOptions:e,position:t=`bottom-right`}){return(0,_.useEffect)(()=>{},[]),e?.hideAttribution?null:(0,L.jsx)(fl,{position:t,className:`react-flow__attribution`,"data-message":`Please only hide this attribution when you are subscribed to React Flow Pro: ${pl}`,children:(0,L.jsx)(`a`,{href:pl,target:`_blank`,rel:`noopener noreferrer`,"aria-label":`React Flow attribution`,children:`React Flow`})})}var hl=e=>{let t=[],n=[];for(let[,n]of e.nodeLookup)n.selected&&t.push(n.internals.userNode);for(let[,t]of e.edgeLookup)t.selected&&n.push(t);return{selectedNodes:t,selectedEdges:n}},gl=e=>e.id;function _l(e,t){return Qc(e.selectedNodes.map(gl),t.selectedNodes.map(gl))&&Qc(e.selectedEdges.map(gl),t.selectedEdges.map(gl))}function vl({onSelectionChange:e}){let t=nl(),{selectedNodes:n,selectedEdges:r}=K(hl,_l);return(0,_.useEffect)(()=>{let i={nodes:n,edges:r};e?.(i),t.getState().onSelectionChangeHandlers.forEach(e=>e(i))},[n,r,e]),null}var yl=e=>!!e.onSelectionChangeHandlers;function bl({onSelectionChange:e}){let t=K(yl);return e||t?(0,L.jsx)(vl,{onSelectionChange:e}):null}var xl=[0,0],Sl={x:0,y:0,zoom:1},Cl=[...`nodes.edges.defaultNodes.defaultEdges.onConnect.onConnectStart.onConnectEnd.onClickConnectStart.onClickConnectEnd.nodesDraggable.autoPanOnNodeFocus.nodesConnectable.nodesFocusable.edgesFocusable.edgesReconnectable.elevateNodesOnSelect.elevateEdgesOnSelect.minZoom.maxZoom.nodeExtent.onNodesChange.onEdgesChange.elementsSelectable.connectionMode.snapGrid.snapToGrid.translateExtent.connectOnClick.defaultEdgeOptions.fitView.fitViewOptions.onNodesDelete.onEdgesDelete.onDelete.onNodeDrag.onNodeDragStart.onNodeDragStop.onSelectionDrag.onSelectionDragStart.onSelectionDragStop.onMoveStart.onMove.onMoveEnd.noPanClassName.nodeOrigin.autoPanOnConnect.autoPanOnNodeDrag.onError.connectionRadius.isValidConnection.selectNodesOnDrag.nodeDragThreshold.connectionDragThreshold.onBeforeDelete.debug.autoPanSpeed.ariaLabelConfig.zIndexMode`.split(`.`),`rfId`],wl=e=>({setNodes:e.setNodes,setEdges:e.setEdges,setMinZoom:e.setMinZoom,setMaxZoom:e.setMaxZoom,setTranslateExtent:e.setTranslateExtent,setNodeExtent:e.setNodeExtent,reset:e.reset,setDefaultNodesAndEdges:e.setDefaultNodesAndEdges}),Tl={translateExtent:ro,nodeOrigin:xl,minZoom:.5,maxZoom:2,elementsSelectable:!0,noPanClassName:`nopan`,rfId:`1`};function El(e){let{setNodes:t,setEdges:n,setMinZoom:r,setMaxZoom:i,setTranslateExtent:a,setNodeExtent:o,reset:s,setDefaultNodesAndEdges:c}=K(wl,Qc),l=nl();(0,_.useEffect)(()=>(c(e.defaultNodes,e.defaultEdges),()=>{u.current=Tl,s()}),[]);let u=(0,_.useRef)(Tl);return(0,_.useEffect)(()=>{for(let s of Cl){let c=e[s];c!==u.current[s]&&e[s]!==void 0&&(s===`nodes`?t(c):s===`edges`?n(c):s===`minZoom`?r(c):s===`maxZoom`?i(c):s===`translateExtent`?a(c):s===`nodeExtent`?o(c):s===`ariaLabelConfig`?l.setState({ariaLabelConfig:$o(c)}):s===`fitView`?l.setState({fitViewQueued:c}):s===`fitViewOptions`?l.setState({fitViewOptions:c}):l.setState({[s]:c}))}u.current=e},Cl.map(t=>e[t])),null}function Dl(){return typeof window>`u`||!window.matchMedia?null:window.matchMedia(`(prefers-color-scheme: dark)`)}function Ol(e){let[t,n]=(0,_.useState)(e===`system`?null:e);return(0,_.useEffect)(()=>{if(e!==`system`){n(e);return}let t=Dl(),r=()=>n(t?.matches?`dark`:`light`);return r(),t?.addEventListener(`change`,r),()=>{t?.removeEventListener(`change`,r)}},[e]),t===null?Dl()?.matches?`dark`:`light`:t}var kl=typeof document<`u`?document:null;function Al(e=null,t={target:kl,actInsideInputWithModifier:!0}){let[n,r]=(0,_.useState)(!1),i=(0,_.useRef)(!1),a=(0,_.useRef)(new Set([])),[o,s]=(0,_.useMemo)(()=>{if(e!==null){let t=(Array.isArray(e)?e:[e]).filter(e=>typeof e==`string`).map(e=>e.replace(/\\+/g,`\n`).replace(`\n\n`,`\n+`).split(`\n`));return[t,t.reduce((e,t)=>e.concat(...t),[])]}return[[],[]]},[e]);return(0,_.useEffect)(()=>{let n=t?.target??kl,c=t?.actInsideInputWithModifier??!0;if(e!==null){let e=e=>{if(i.current=e.ctrlKey||e.metaKey||e.shiftKey||e.altKey,(!i.current||i.current&&!c)&&as(e))return!1;let n=Ml(e.code,s);if(a.current.add(e[n]),jl(o,a.current,!1)){let n=e.composedPath?.()?.[0]||e.target,a=n?.nodeName===`BUTTON`||n?.nodeName===`A`;t.preventDefault!==!1&&(i.current||!a)&&e.preventDefault(),r(!0)}},l=e=>{let t=Ml(e.code,s);jl(o,a.current,!0)?(r(!1),a.current.clear()):a.current.delete(e[t]),e.key===`Meta`&&a.current.clear(),i.current=!1},u=()=>{a.current.clear(),r(!1)};return n?.addEventListener(`keydown`,e),n?.addEventListener(`keyup`,l),window.addEventListener(`blur`,u),window.addEventListener(`contextmenu`,u),()=>{n?.removeEventListener(`keydown`,e),n?.removeEventListener(`keyup`,l),window.removeEventListener(`blur`,u),window.removeEventListener(`contextmenu`,u)}}},[e,r]),n}function jl(e,t,n){return e.filter(e=>n||e.length===t.size).some(e=>e.every(e=>t.has(e)))}function Ml(e,t){return t.includes(e)?`code`:`key`}var Nl=()=>{let e=nl();return(0,_.useMemo)(()=>({zoomIn:async t=>{let{panZoom:n}=e.getState();return n?n.scaleBy(1.2,t):!1},zoomOut:async t=>{let{panZoom:n}=e.getState();return n?n.scaleBy(1/1.2,t):!1},zoomTo:async(t,n)=>{let{panZoom:r}=e.getState();return r?r.scaleTo(t,n):!1},getZoom:()=>e.getState().transform[2],setViewport:async(t,n)=>{let{transform:[r,i,a],panZoom:o}=e.getState();return o?(await o.setViewport({x:t.x??r,y:t.y??i,zoom:t.zoom??a},n),!0):!1},getViewport:()=>{let[t,n,r]=e.getState().transform;return{x:t,y:n,zoom:r}},setCenter:async(t,n,r)=>e.getState().setCenter(t,n,r),fitBounds:async(t,n)=>{let{width:r,height:i,minZoom:a,maxZoom:o,panZoom:s}=e.getState(),c=Ko(t,r,i,a,o,n?.padding??.1);return s?(await s.setViewport(c,{duration:n?.duration,ease:n?.ease,interpolate:n?.interpolate}),!0):!1},screenToFlowPosition:(t,n={})=>{let{transform:r,snapGrid:i,snapToGrid:a,domNode:o}=e.getState();if(!o)return t;let{x:s,y:c}=o.getBoundingClientRect(),l={x:t.x-s,y:t.y-c},u=n.snapGrid??i;return Vo(l,r,n.snapToGrid??a,u)},flowToScreenPosition:t=>{let{transform:n,domNode:r}=e.getState();if(!r)return t;let{x:i,y:a}=r.getBoundingClientRect(),o=Ho(t,n);return{x:o.x+i,y:o.y+a}}}),[])};function Pl(e,t){let n=[],r=new Map,i=[];for(let t of e)if(t.type===`add`){i.push(t);continue}else if(t.type===`remove`||t.type===`replace`)r.set(t.id,[t]);else{let e=r.get(t.id);e?e.push(t):r.set(t.id,[t])}for(let e of t){let t=r.get(e.id);if(!t){n.push(e);continue}if(t[0].type===`remove`)continue;if(t[0].type===`replace`){n.push({...t[0].item});continue}let i={...e};for(let e of t)Fl(e,i);n.push(i)}return i.length&&i.forEach(e=>{e.index===void 0?n.push({...e.item}):n.splice(e.index,0,{...e.item})}),n}function Fl(e,t){switch(e.type){case`select`:t.selected=e.selected;break;case`position`:e.position!==void 0&&(t.position=e.position),e.dragging!==void 0&&(t.dragging=e.dragging);break;case`dimensions`:e.dimensions!==void 0&&(t.measured={...e.dimensions},e.setAttributes&&((e.setAttributes===!0||e.setAttributes===`width`)&&(t.width=e.dimensions.width),(e.setAttributes===!0||e.setAttributes===`height`)&&(t.height=e.dimensions.height))),typeof e.resizing==`boolean`&&(t.resizing=e.resizing)}}function Il(e,t){return Pl(e,t)}function Ll(e,t){return Pl(e,t)}function Rl(e,t){return{id:e,type:`select`,selected:t}}function zl(e,t=new Set,n=!1){let r=[];for(let[i,a]of e){let e=t.has(i);(a.selected!==void 0||e)&&a.selected!==e&&(n&&(a.selected=e),r.push(Rl(a.id,e)))}return r}function Bl({items:e=[],lookup:t}){let n=[],r=new Map(e.map(e=>[e.id,e]));for(let[r,i]of e.entries()){let e=t.get(i.id),a=e?.internals?.userNode??e;a!==void 0&&a!==i&&n.push({id:i.id,item:i,type:`replace`}),a===void 0&&n.push({item:i,type:`add`,index:r})}for(let[e]of t)r.get(e)===void 0&&n.push({id:e,type:`remove`});return n}function Vl(e){return{id:e.id,type:`remove`}}var Hl=U(`React Flow`,`https://reactflow.dev/`);function Ul(e,t,n={}){return vs(e,t,{...n,onError:n.onError??Hl})}var Wl=e=>ho(e),Gl=e=>mo(e);function Kl(e){return(0,_.forwardRef)(e)}var ql=typeof window<`u`?_.useLayoutEffect:_.useEffect;function Jl(e){let[t,n]=(0,_.useState)(BigInt(0)),[r]=(0,_.useState)(()=>Yl(()=>n(e=>e+BigInt(1))));return ql(()=>{let t=r.get();t.length&&(e(t),r.reset())},[t]),r}function Yl(e){let t=[];return{get:()=>t,reset:()=>{t=[]},push:n=>{t.push(n),e()}}}var Xl=(0,_.createContext)(null);function Zl({children:e}){let t=nl(),n=Jl((0,_.useCallback)(e=>{let{nodes:n=[],setNodes:r,hasDefaultNodes:i,onNodesChange:a,nodeLookup:o,fitViewQueued:s,onNodesChangeMiddlewareMap:c}=t.getState(),l=n;for(let t of e)l=typeof t==`function`?t(l):t;let u=Bl({items:l,lookup:o});for(let e of c.values())u=e(u);i&&r(l),u.length>0?a?.(u):s&&window.requestAnimationFrame(()=>{let{fitViewQueued:e,nodes:n,setNodes:r}=t.getState();e&&r(n)})},[])),r=Jl((0,_.useCallback)(e=>{let{edges:n=[],setEdges:r,hasDefaultEdges:i,onEdgesChange:a,edgeLookup:o}=t.getState(),s=n;for(let t of e)s=typeof t==`function`?t(s):t;i?r(s):a&&a(Bl({items:s,lookup:o}))},[])),i=(0,_.useMemo)(()=>({nodeQueue:n,edgeQueue:r}),[]);return(0,L.jsx)(Xl.Provider,{value:i,children:e})}function Ql(){let e=(0,_.useContext)(Xl);if(!e)throw Error(`useBatchContext must be used within a BatchProvider`);return e}var $l=e=>!!e.panZoom;function eu(){let e=Nl(),t=nl(),n=Ql(),r=K($l),i=(0,_.useMemo)(()=>{let e=e=>t.getState().nodeLookup.get(e),r=e=>{n.nodeQueue.push(e)},i=e=>{n.edgeQueue.push(e)},a=e=>{let{nodeLookup:n,nodeOrigin:r}=t.getState(),i=Wl(e)?e:n.get(e.id),a=i.parentId?Xo(i.position,i.measured,i.parentId,n,r):i.position;return Po({...i,position:a,width:i.measured?.width??i.width,height:i.measured?.height??i.height})},o=(e,t,n={replace:!1})=>{r(r=>r.map(r=>{if(r.id===e){let e=typeof t==`function`?t(r):t;return n.replace&&Wl(e)?e:{...r,...e}}return r}))},s=(e,t,n={replace:!1})=>{i(r=>r.map(r=>{if(r.id===e){let e=typeof t==`function`?t(r):t;return n.replace&&Gl(e)?e:{...r,...e}}return r}))};return{getNodes:()=>t.getState().nodes.map(e=>({...e})),getNode:t=>e(t)?.internals.userNode,getInternalNode:e,getEdges:()=>{let{edges:e=[]}=t.getState();return e.map(e=>({...e}))},getEdge:e=>t.getState().edgeLookup.get(e),setNodes:r,setEdges:i,addNodes:e=>{let t=Array.isArray(e)?e:[e];n.nodeQueue.push(e=>[...e,...t])},addEdges:e=>{let t=Array.isArray(e)?e:[e];n.edgeQueue.push(e=>[...e,...t])},toObject:()=>{let{nodes:e=[],edges:n=[],transform:r}=t.getState(),[i,a,o]=r;return{nodes:e.map(e=>({...e})),edges:n.map(e=>({...e})),viewport:{x:i,y:a,zoom:o}}},deleteElements:async({nodes:e=[],edges:n=[]})=>{let{nodes:r,edges:i,onNodesDelete:a,onEdgesDelete:o,triggerNodeChanges:s,triggerEdgeChanges:c,onDelete:l,onBeforeDelete:u}=t.getState(),{nodes:d,edges:f}=await To({nodesToRemove:e,edgesToRemove:n,nodes:r,edges:i,onBeforeDelete:u}),p=f.length>0,m=d.length>0;if(p){let e=f.map(Vl);o?.(f),c(e)}if(m){let e=d.map(Vl);a?.(d),s(e)}return(m||p)&&l?.({nodes:d,edges:f}),{deletedNodes:d,deletedEdges:f}},getIntersectingNodes:(e,n=!0,r)=>{let i=zo(e),o=i?e:a(e),s=r!==void 0;return o?(r||t.getState().nodes).filter(r=>{let a=t.getState().nodeLookup.get(r.id);if(a&&!i&&(r.id===e.id||!a.internals.positionAbsolute))return!1;let c=Po(s?r:a),l=Ro(c,o);return n&&l>0||l>=c.width*c.height||l>=o.width*o.height}):[]},isNodeIntersecting:(e,t,n=!0)=>{let r=zo(e)?e:a(e);if(!r)return!1;let i=Ro(r,t);return n&&i>0||i>=t.width*t.height||i>=r.width*r.height},updateNode:o,updateNodeData:(e,t,n={replace:!1})=>{o(e,e=>{let r=typeof t==`function`?t(e):t;return n.replace?{...e,data:r}:{...e,data:{...e.data,...r}}},n)},updateEdge:s,updateEdgeData:(e,t,n={replace:!1})=>{s(e,e=>{let r=typeof t==`function`?t(e):t;return n.replace?{...e,data:r}:{...e,data:{...e.data,...r}}},n)},getNodesBounds:e=>{let{nodeLookup:n,nodeOrigin:r}=t.getState();return vo(e,{nodeLookup:n,nodeOrigin:r})},getHandleConnections:({type:e,id:n,nodeId:r})=>Array.from(t.getState().connectionLookup.get(`${r}-${e}${n?`-${n}`:``}`)?.values()??[]),getNodeConnections:({type:e,handleId:n,nodeId:r})=>Array.from(t.getState().connectionLookup.get(`${r}${e?n?`-${e}-${n}`:`-${e}`:``}`)?.values()??[]),fitView:async e=>{let r=t.getState().fitViewResolver??Qo();return t.setState({fitViewQueued:!0,fitViewOptions:e,fitViewResolver:r}),n.nodeQueue.push(e=>[...e]),r.promise}}},[]);return(0,_.useMemo)(()=>({...i,...e,viewportInitialized:r}),[r])}var tu=e=>e.selected,nu=typeof window<`u`?window:void 0;function q({deleteKeyCode:e,multiSelectionKeyCode:t}){let n=nl(),{deleteElements:r}=eu(),i=Al(e,{actInsideInputWithModifier:!1}),a=Al(t,{target:nu});(0,_.useEffect)(()=>{if(i){let{edges:e,nodes:t}=n.getState();r({nodes:t.filter(tu),edges:e.filter(tu)}),n.setState({nodesSelectionActive:!1})}},[i]),(0,_.useEffect)(()=>{n.setState({multiSelectionActive:a})},[a])}function ru(e){let t=nl();(0,_.useEffect)(()=>{let n=()=>{if(!e.current||!(e.current.checkVisibility?.()??!0))return!1;let n=ns(e.current);(n.height===0||n.width===0)&&t.getState().onError?.(`004`,no.error004()),t.setState({width:n.width||500,height:n.height||500})};if(e.current){n(),window.addEventListener(`resize`,n);let t=new ResizeObserver(()=>n());return t.observe(e.current),()=>{window.removeEventListener(`resize`,n),t&&e.current&&t.unobserve(e.current)}}},[])}var iu={position:`absolute`,width:`100%`,height:`100%`,top:0,left:0},au=e=>({userSelectionActive:e.userSelectionActive,lib:e.lib,connectionInProgress:e.connection.inProgress});function ou({onPaneContextMenu:e,zoomOnScroll:t=!0,zoomOnPinch:n=!0,panOnScroll:r=!1,panActivationKeyPressed:i,panOnScrollSpeed:a=.5,panOnScrollMode:o=so.Free,zoomOnDoubleClick:s=!0,panOnDrag:c=!0,defaultViewport:l,translateExtent:u,minZoom:d,maxZoom:f,zoomActivationKeyCode:p,preventScrolling:m=!0,children:h,noWheelClassName:g,noPanClassName:v,onViewportChange:y,isControlledViewport:b,paneClickDistance:x,selectionOnDrag:S}){let C=nl(),w=(0,_.useRef)(null),{userSelectionActive:T,lib:E,connectionInProgress:D}=K(au,Qc),O=Al(p),k=(0,_.useRef)();ru(w);let A=(0,_.useCallback)(e=>{y?.({x:e[0],y:e[1],zoom:e[2]}),b||C.setState({transform:e})},[y,b]);return(0,_.useEffect)(()=>{if(w.current){k.current=Dc({domNode:w.current,minZoom:d,maxZoom:f,translateExtent:u,viewport:l,onDraggingChange:e=>C.setState(t=>t.paneDragging===e?t:{paneDragging:e}),onPanZoomStart:(e,t)=>{let{onViewportChangeStart:n,onMoveStart:r}=C.getState();r?.(e,t),n?.(t)},onPanZoom:(e,t)=>{let{onViewportChange:n,onMove:r}=C.getState();r?.(e,t),n?.(t)},onPanZoomEnd:(e,t)=>{let{onViewportChangeEnd:n,onMoveEnd:r}=C.getState();r?.(e,t),n?.(t)}});let{x:e,y:t,zoom:n}=k.current.getViewport();return C.setState({panZoom:k.current,transform:[e,t,n],domNode:w.current.closest(`.react-flow`)}),()=>{k.current?.destroy()}}},[]),(0,_.useEffect)(()=>{k.current?.update({onPaneContextMenu:e,zoomOnScroll:t,zoomOnPinch:n,panOnScroll:r,panActivationKeyPressed:i,panOnScrollSpeed:a,panOnScrollMode:o,zoomOnDoubleClick:s,panOnDrag:c,zoomActivationKeyPressed:O,preventScrolling:m,noPanClassName:v,userSelectionActive:T,noWheelClassName:g,lib:E,onTransformChange:A,connectionInProgress:D,selectionOnDrag:S,paneClickDistance:x})},[e,t,n,r,i,a,o,s,c,O,m,v,T,g,E,A,D,S,x]),(0,L.jsx)(`div`,{className:`react-flow__renderer`,ref:w,style:iu,children:h})}var su=e=>({userSelectionActive:e.userSelectionActive,userSelectionRect:e.userSelectionRect});function cu(){let{userSelectionActive:e,userSelectionRect:t}=K(su,Qc);return e&&t?(0,L.jsx)(`div`,{className:`react-flow__selection react-flow__container`,style:{width:t.width,height:t.height,transform:`translate(${t.x}px, ${t.y}px)`}}):null}var lu=(e,t)=>n=>{n.target===t.current&&e?.(n)},uu=e=>({userSelectionActive:e.userSelectionActive,elementsSelectable:e.elementsSelectable,dragging:e.paneDragging,panBy:e.panBy,autoPanSpeed:e.autoPanSpeed});function du({isSelecting:e,selectionKeyPressed:t,selectionMode:n=co.Full,panOnDrag:r,autoPanOnSelection:i,paneClickDistance:a,selectionOnDrag:o,onSelectionStart:s,onSelectionEnd:c,onPaneClick:l,onPaneContextMenu:u,onPaneScroll:d,onPaneMouseEnter:f,onPaneMouseMove:p,onPaneMouseLeave:m,children:h}){let g=(0,_.useRef)(0),v=nl(),{userSelectionActive:y,elementsSelectable:b,dragging:x,panBy:S,autoPanSpeed:C}=K(uu,Qc),w=b&&(e||y),T=(0,_.useRef)(null),E=(0,_.useRef)(),D=(0,_.useRef)(new Set),O=(0,_.useRef)(new Set),k=(0,_.useRef)(!1),A=(0,_.useRef)(!1),j=(0,_.useRef)({x:0,y:0}),ee=(0,_.useRef)(!1),te=e=>{A.current||k.current||v.getState().connection.inProgress?(A.current=!1,k.current=!1):(l?.(e),v.getState().resetSelectedElements(),v.setState({nodesSelectionActive:!1}))},M=e=>{Array.isArray(r)&&r?.includes(2)?e.preventDefault():u?.(e)},N=d?e=>d(e):void 0,ne=e=>{A.current&&=(e.stopPropagation(),!1)},re=n=>{if(n.pointerType===`touch`&&r!==!1&&!t)return;let{domNode:i,transform:a}=v.getState();if(E.current=i?.getBoundingClientRect(),!E.current)return;let s=n.target===T.current;if(!s&&n.target.closest(`.nokey`)||!e||!(o&&s||t)||n.button!==0||!n.isPrimary)return;n.target?.setPointerCapture?.(n.pointerId),A.current=!1;let{x:c,y:l}=ss(n.nativeEvent,E.current),u=Vo({x:c,y:l},a);v.setState({userSelectionRect:{width:0,height:0,startX:u.x,startY:u.y,x:c,y:l}}),s||(n.stopPropagation(),n.preventDefault())};function ie(e,t){let{userSelectionRect:r}=v.getState();if(!r)return;let{transform:i,nodeLookup:a,edgeLookup:o,connectionLookup:s,triggerNodeChanges:c,triggerEdgeChanges:l,defaultEdgeOptions:u}=v.getState(),d={x:r.startX,y:r.startY},{x:f,y:p}=Ho(d,i),m={startX:d.x,startY:d.y,x:e<f?e:f,y:t<p?t:p,width:Math.abs(e-f),height:Math.abs(t-p)},h=D.current,g=O.current;D.current=new Set(bo(a,m,i,n===co.Partial,!0).map(e=>e.id)),O.current=new Set;let _=u?.selectable??!0;for(let e of D.current){let t=s.get(e);if(t)for(let{edgeId:e}of t.values()){let t=o.get(e);t&&(t.selectable??_)&&O.current.add(e)}}Zo(h,D.current)||c(zl(a,D.current,!0)),Zo(g,O.current)||l(zl(o,O.current)),v.setState({userSelectionRect:m,userSelectionActive:!0,nodesSelectionActive:!1})}function P(){if(!i||!E.current)return;let[e,t]=Ao(j.current,E.current,C);S({x:e,y:t}).then(e=>{if(!A.current||!e){g.current=requestAnimationFrame(P);return}let{x:t,y:n}=j.current;ie(t,n),g.current=requestAnimationFrame(P)})}let ae=()=>{cancelAnimationFrame(g.current),g.current=0,ee.current=!1};(0,_.useEffect)(()=>()=>ae(),[]);let oe=e=>{let{userSelectionRect:n,transform:r,resetSelectedElements:i}=v.getState();if(!E.current||!n)return;let{x:o,y:c}=ss(e.nativeEvent,E.current);j.current={x:o,y:c};let l=Ho({x:n.startX,y:n.startY},r);if(!A.current){let n=t?0:a;if(Math.hypot(o-l.x,c-l.y)<=n)return;i(),s?.(e)}A.current=!0,ee.current||=(P(),!0),ie(o,c)},se=e=>{w?e.button===0&&(e.target?.releasePointerCapture?.(e.pointerId),!y&&e.target===T.current&&v.getState().userSelectionRect&&te?.(e),v.setState({userSelectionActive:!1,userSelectionRect:null}),A.current&&(c?.(e),v.setState({nodesSelectionActive:D.current.size>0})),ae()):e.target===T.current&&v.getState().connection.inProgress&&(k.current=!0)},ce=e=>{e.target?.releasePointerCapture?.(e.pointerId),ae()},le=r===!0||Array.isArray(r)&&r.includes(0);return(0,L.jsxs)(`div`,{className:z([`react-flow__pane`,{draggable:le,dragging:x,selection:e}]),onClick:w?void 0:lu(te,T),onContextMenu:lu(M,T),onWheel:lu(N,T),onPointerEnter:w?void 0:f,onPointerMove:w?oe:p,onPointerUp:se,onPointerCancel:w?ce:void 0,onPointerDownCapture:w?re:void 0,onClickCapture:w?ne:void 0,onPointerLeave:m,ref:T,style:iu,children:[h,(0,L.jsx)(cu,{})]})}function fu({id:e,store:t,unselect:n=!1,nodeRef:r}){let{addSelectedNodes:i,unselectNodesAndEdges:a,multiSelectionActive:o,nodeLookup:s,onError:c}=t.getState(),l=s.get(e);l?(t.setState({nodesSelectionActive:!1}),l.selected?(n||l.selected&&o)&&(a({nodes:[l],edges:[]}),requestAnimationFrame(()=>r?.current?.blur())):i([e])):c?.(`012`,no.error012(e))}function pu({nodeRef:e,disabled:t=!1,noDragClassName:n,handleSelector:r,nodeId:i,isSelectable:a,nodeClickDistance:o}){let s=nl(),[c,l]=(0,_.useState)(!1),u=(0,_.useRef)();return(0,_.useEffect)(()=>{if(!t)return u.current=nc({getStoreItems:()=>s.getState(),onNodeMouseDown:t=>{fu({id:t,store:s,nodeRef:e})},onDragStart:()=>{l(!0)},onDragStop:()=>{l(!1)}}),()=>{u.current?.destroy(),u.current=void 0}},[t,s,e]),(0,_.useEffect)(()=>{!t&&e.current&&u.current&&u.current.update({noDragClassName:n,handleSelector:r,domNode:e.current,isSelectable:a,nodeId:i,nodeClickDistance:o})},[n,r,t,a,e,i,o]),c}var mu=e=>t=>t.selected&&(t.draggable||e&&t.draggable===void 0);function hu(){let e=nl();return(0,_.useCallback)(t=>{let{nodeExtent:n,snapToGrid:r,snapGrid:i,nodesDraggable:a,onError:o,updateNodePositions:s,nodeLookup:c,nodeOrigin:l}=e.getState(),u=new Map,d=mu(a),f=r?i[0]:5,p=r?i[1]:5,m=t.direction.x*f*t.factor,h=t.direction.y*p*t.factor;for(let[,e]of c){if(!d(e))continue;let t={x:e.internals.positionAbsolute.x+m,y:e.internals.positionAbsolute.y+h};r&&(t=W(t,i));let{position:a,positionAbsolute:s}=wo({nodeId:e.id,nextPosition:t,nodeLookup:c,nodeExtent:n,nodeOrigin:l,onError:o});e.position=a,e.internals.positionAbsolute=s,u.set(e.id,e)}s(u)},[])}var gu=(0,_.createContext)(null),_u=gu.Provider;gu.Consumer;var vu=()=>(0,_.useContext)(gu),yu=e=>({connectOnClick:e.connectOnClick,noPanClassName:e.noPanClassName,rfId:e.rfId}),bu=(0,_.createContext)(null);function xu({children:e}){let t=K(yu,Qc);return(0,L.jsx)(bu.Provider,{value:t,children:e})}function Su(){let e=(0,_.useContext)(bu);if(!e)throw Error(`useHandleConfig must be used within a HandleConfigProvider`);return e}var Cu={connectingFrom:!1,connectingTo:!1,clickConnecting:!1,isPossibleEndHandle:!0,connectionInProcess:!1,clickConnectionInProcess:!1,valid:!1},wu=(e,t,n)=>r=>{let{connectionClickStartHandle:i,connectionMode:a,connection:o}=r,{fromHandle:s,toHandle:c,isValid:l}=o;if(!s&&!i)return Cu;let u=c?.nodeId===e&&c?.id===t&&c?.type===n;return{connectingFrom:s?.nodeId===e&&s?.id===t&&s?.type===n,connectingTo:u,clickConnecting:i?.nodeId===e&&i?.id===t&&i?.type===n,isPossibleEndHandle:a===oo.Strict?s?.type!==n:e!==s?.nodeId||t!==s?.id,connectionInProcess:!!s,clickConnectionInProcess:!!i,valid:u&&l}};function Tu({type:e=`source`,position:t=H.Top,isValidConnection:n,isConnectable:r=!0,isConnectableStart:i=!0,isConnectableEnd:a=!0,id:o,onConnect:s,children:c,className:l,onMouseDown:u,onTouchStart:d,...f},p){let m=o||null,h=e===`target`,g=nl(),_=vu(),{connectOnClick:v,noPanClassName:y,rfId:b}=Su(),{connectingFrom:x,connectingTo:S,clickConnecting:C,isPossibleEndHandle:w,connectionInProcess:T,clickConnectionInProcess:E,valid:D}=K(wu(_,m,e),Qc);_||g.getState().onError?.(`010`,no.error010());let O=e=>{let{defaultEdgeOptions:t,onConnect:n,hasDefaultEdges:r}=g.getState(),i={...t,...e};if(r){let{edges:e,setEdges:t,onError:n}=g.getState();t(Ul(i,e,{onError:n}))}n?.(i),s?.(i)},k=e=>{if(!_)return;let t=os(e.nativeEvent);if(i&&(t&&e.button===0||!t)){let t=g.getState();fc.onPointerDown(e.nativeEvent,{handleDomNode:e.currentTarget,autoPanOnConnect:t.autoPanOnConnect,connectionMode:t.connectionMode,connectionRadius:t.connectionRadius,domNode:t.domNode,nodeLookup:t.nodeLookup,lib:t.lib,isTarget:h,handleId:m,nodeId:_,flowId:t.rfId,panBy:t.panBy,cancelConnection:t.cancelConnection,onConnectStart:t.onConnectStart,onConnectEnd:(...e)=>g.getState().onConnectEnd?.(...e),updateConnection:t.updateConnection,onConnect:O,isValidConnection:n||((...e)=>g.getState().isValidConnection?.(...e)??!0),getTransform:()=>g.getState().transform,getFromHandle:()=>g.getState().connection.fromHandle,autoPanSpeed:t.autoPanSpeed,dragThreshold:t.connectionDragThreshold})}t?u?.(e):d?.(e)};return(0,L.jsx)(`div`,{"data-handleid":m,"data-nodeid":_,"data-handlepos":t,"data-id":`${b}-${_}-${m}-${e}`,className:z([`react-flow__handle`,`react-flow__handle-${t}`,`nodrag`,y,l,{source:!h,target:h,connectable:r,connectablestart:i,connectableend:a,clickconnecting:C,connectingfrom:x,connectingto:S,valid:D,connectionindicator:r&&(!T||w)&&(T||E?a:i)}]),onMouseDown:k,onTouchStart:k,onClick:v?t=>{let{onClickConnectStart:r,onClickConnectEnd:a,connectionClickStartHandle:o,connectionMode:s,isValidConnection:c,lib:l,rfId:u,nodeLookup:d,connection:f}=g.getState();if(!_||!o&&!i)return;if(!o){r?.(t.nativeEvent,{nodeId:_,handleId:m,handleType:e}),g.setState({connectionClickStartHandle:{nodeId:_,type:e,id:m}});return}let p=rs(t.target),h=n||c,{connection:v,isValid:y}=fc.isValid(t.nativeEvent,{handle:{nodeId:_,id:m,type:e},connectionMode:s,fromNodeId:o.nodeId,fromHandleId:o.id||null,fromType:o.type,isValidConnection:h,flowId:u,doc:p,lib:l,nodeLookup:d});y&&v&&O(v);let b=structuredClone(f);delete b.inProgress,b.toPosition=b.toHandle?b.toHandle.position:null,a?.(t,b),g.setState({connectionClickStartHandle:null})}:void 0,ref:p,...f,children:c})}var Eu=(0,_.memo)(Kl(Tu));function Du({data:e,isConnectable:t,sourcePosition:n=H.Bottom}){return(0,L.jsxs)(L.Fragment,{children:[e?.label,(0,L.jsx)(Eu,{type:`source`,position:n,isConnectable:t})]})}function Ou({data:e,isConnectable:t,targetPosition:n=H.Top,sourcePosition:r=H.Bottom}){return(0,L.jsxs)(L.Fragment,{children:[(0,L.jsx)(Eu,{type:`target`,position:n,isConnectable:t}),e?.label,(0,L.jsx)(Eu,{type:`source`,position:r,isConnectable:t})]})}function ku(){return null}function Au({data:e,isConnectable:t,targetPosition:n=H.Top}){return(0,L.jsxs)(L.Fragment,{children:[(0,L.jsx)(Eu,{type:`target`,position:n,isConnectable:t}),e?.label]})}var ju={ArrowUp:{x:0,y:-1},ArrowDown:{x:0,y:1},ArrowLeft:{x:-1,y:0},ArrowRight:{x:1,y:0}},Mu={input:Du,default:Ou,output:Au,group:ku};function Nu(e){return e.internals.handleBounds===void 0?{width:e.width??e.initialWidth??e.style?.width,height:e.height??e.initialHeight??e.style?.height}:{width:e.width??e.style?.width,height:e.height??e.style?.height}}var Pu=e=>{let{width:t,height:n,x:r,y:i}=yo(e.nodeLookup,{filter:e=>!!e.selected});return{width:Bo(t)?t:null,height:Bo(n)?n:null,userSelectionActive:e.userSelectionActive,transformString:`translate(${e.transform[0]}px,${e.transform[1]}px) scale(${e.transform[2]}) translate(${r}px,${i}px)`}};function Fu({onSelectionContextMenu:e,noPanClassName:t,disableKeyboardA11y:n}){let r=nl(),{width:i,height:a,transformString:o,userSelectionActive:s}=K(Pu,Qc),c=hu(),l=(0,_.useRef)(null);(0,_.useEffect)(()=>{n||l.current?.focus({preventScroll:!0})},[n]);let u=!s&&i!==null&&a!==null;if(pu({nodeRef:l,disabled:!u}),!u)return null;let d=e?t=>{e(t,r.getState().nodes.filter(e=>e.selected))}:void 0;return(0,L.jsx)(`div`,{className:z([`react-flow__nodesselection`,`react-flow__container`,t]),style:{transform:o},children:(0,L.jsx)(`div`,{ref:l,className:`react-flow__nodesselection-rect`,onContextMenu:d,tabIndex:n?void 0:-1,onKeyDown:n?void 0:e=>{Object.prototype.hasOwnProperty.call(ju,e.key)&&(e.preventDefault(),c({direction:ju[e.key],factor:e.shiftKey?4:1}))},style:{width:i,height:a}})})}var Iu=typeof window<`u`?window:void 0,Lu=e=>({nodesSelectionActive:e.nodesSelectionActive,userSelectionActive:e.userSelectionActive});function Ru({children:e,onPaneClick:t,onPaneMouseEnter:n,onPaneMouseMove:r,onPaneMouseLeave:i,onPaneContextMenu:a,onPaneScroll:o,paneClickDistance:s,deleteKeyCode:c,selectionKeyCode:l,selectionOnDrag:u,selectionMode:d,onSelectionStart:f,onSelectionEnd:p,multiSelectionKeyCode:m,panActivationKeyCode:h,zoomActivationKeyCode:g,elementsSelectable:_,zoomOnScroll:v,zoomOnPinch:y,panOnScroll:b,panOnScrollSpeed:x,panOnScrollMode:S,zoomOnDoubleClick:C,panOnDrag:w,autoPanOnSelection:T,defaultViewport:E,translateExtent:D,minZoom:O,maxZoom:k,preventScrolling:A,onSelectionContextMenu:j,noWheelClassName:ee,noPanClassName:te,disableKeyboardA11y:M,onViewportChange:N,isControlledViewport:ne}){let{nodesSelectionActive:re,userSelectionActive:ie}=K(Lu,Qc),P=Al(l,{target:Iu}),ae=Al(h,{target:Iu}),oe=ae||w,se=ae||b,ce=u&&oe!==!0,le=P||ie||ce;return q({deleteKeyCode:c,multiSelectionKeyCode:m}),(0,L.jsx)(ou,{onPaneContextMenu:a,elementsSelectable:_,zoomOnScroll:v,zoomOnPinch:y,panOnScroll:se,panActivationKeyPressed:ae,panOnScrollSpeed:x,panOnScrollMode:S,zoomOnDoubleClick:C,panOnDrag:!P&&oe,defaultViewport:E,translateExtent:D,minZoom:O,maxZoom:k,zoomActivationKeyCode:g,preventScrolling:A,noWheelClassName:ee,noPanClassName:te,onViewportChange:N,isControlledViewport:ne,paneClickDistance:s,selectionOnDrag:ce,children:(0,L.jsxs)(du,{onSelectionStart:f,onSelectionEnd:p,onPaneClick:t,onPaneMouseEnter:n,onPaneMouseMove:r,onPaneMouseLeave:i,onPaneContextMenu:a,onPaneScroll:o,panOnDrag:oe,autoPanOnSelection:T,isSelecting:!!le,selectionMode:d,selectionKeyPressed:P,paneClickDistance:s,selectionOnDrag:ce,children:[e,re&&(0,L.jsx)(Fu,{onSelectionContextMenu:j,noPanClassName:te,disableKeyboardA11y:M})]})})}Ru.displayName=`FlowRenderer`;var zu=(0,_.memo)(Ru),Bu=e=>t=>e?bo(t.nodeLookup,{x:0,y:0,width:t.width,height:t.height},t.transform,!0).map(e=>e.id):Array.from(t.nodeLookup.keys());function Vu(e){return K((0,_.useCallback)(Bu(e),[e]),Qc)}var Hu=e=>e.updateNodeInternals;function Uu(){let e=K(Hu),[t]=(0,_.useState)(()=>typeof ResizeObserver>`u`?null:new ResizeObserver(t=>{let n=new Map;t.forEach(e=>{let t=e.target.getAttribute(`data-id`);n.set(t,{id:t,nodeElement:e.target,force:!0})}),e(n)}));return(0,_.useEffect)(()=>()=>{t?.disconnect()},[t]),t}function Wu({node:e,nodeType:t,hasDimensions:n,resizeObserver:r}){let i=nl(),a=(0,_.useRef)(null),o=(0,_.useRef)(null),s=(0,_.useRef)(e.sourcePosition),c=(0,_.useRef)(e.targetPosition),l=(0,_.useRef)(t),u=n&&!!e.internals.handleBounds;return(0,_.useEffect)(()=>{!a.current||e.hidden||u&&o.current===a.current||(o.current&&r?.unobserve(o.current),r?.observe(a.current),o.current=a.current)},[u,e.hidden]),(0,_.useEffect)(()=>()=>{o.current&&=(r?.unobserve(o.current),null)},[]),(0,_.useEffect)(()=>{if(a.current){let n=l.current!==t,r=s.current!==e.sourcePosition,o=c.current!==e.targetPosition;(n||r||o)&&(l.current=t,s.current=e.sourcePosition,c.current=e.targetPosition,i.getState().updateNodeInternals(new Map([[e.id,{id:e.id,nodeElement:a.current,force:!0}]])))}},[e.id,t,e.sourcePosition,e.targetPosition]),a}function Gu({id:e,onClick:t,onMouseEnter:n,onMouseMove:r,onMouseLeave:i,onContextMenu:a,onDoubleClick:o,nodesDraggable:s,elementsSelectable:c,nodesConnectable:l,nodesFocusable:u,resizeObserver:d,noDragClassName:f,noPanClassName:p,disableKeyboardA11y:m,rfId:h,nodeTypes:g,nodeClickDistance:_,onError:v}){let{node:y,internals:b,isParent:x}=K(t=>{let n=t.nodeLookup.get(e),r=t.parentLookup.has(e);return{node:n,internals:n.internals,isParent:r}},Qc),S=y.type||`default`,C=g?.[S]||Mu[S];C===void 0&&(v?.(`003`,no.error003(S)),S=`default`,C=g?.default||Mu.default);let w=!!(y.draggable||s&&y.draggable===void 0),T=!!(y.selectable||c&&y.selectable===void 0),E=!!(y.connectable||l&&y.connectable===void 0),D=!!(y.focusable||u&&y.focusable===void 0),O=nl(),k=Yo(y),A=Wu({node:y,nodeType:S,hasDimensions:k,resizeObserver:d}),j=pu({nodeRef:A,disabled:y.hidden||!w,noDragClassName:f,handleSelector:y.dragHandle,nodeId:e,isSelectable:T,nodeClickDistance:_}),ee=hu();if(y.hidden)return null;let te=G(y),M=Nu(y),N=T||w||t||n||r||i,ne=n?e=>n(e,{...b.userNode}):void 0,re=r?e=>r(e,{...b.userNode}):void 0,ie=i?e=>i(e,{...b.userNode}):void 0,P=a?e=>a(e,{...b.userNode}):void 0,ae=o?e=>o(e,{...b.userNode}):void 0,oe=n=>{let{selectNodesOnDrag:r,nodeDragThreshold:i}=O.getState();T&&(!r||!w||i>0)&&fu({id:e,store:O,nodeRef:A}),t&&t(n,{...b.userNode})},se=t=>{if(!(as(t.nativeEvent)||m)){if(io.includes(t.key)&&T){let n=t.key===`Escape`;fu({id:e,store:O,unselect:n,nodeRef:A})}else if(w&&y.selected&&Object.prototype.hasOwnProperty.call(ju,t.key)){t.preventDefault();let{ariaLabelConfig:e}=O.getState();O.setState({ariaLiveMessage:e[`node.a11yDescription.ariaLiveMessage`]({direction:t.key.replace(`Arrow`,``).toLowerCase(),x:~~b.positionAbsolute.x,y:~~b.positionAbsolute.y})}),ee({direction:ju[t.key],factor:t.shiftKey?4:1})}}},ce=()=>{if(m||!A.current?.matches(`:focus-visible`))return;let{transform:t,width:n,height:r,autoPanOnNodeFocus:i,setCenter:a}=O.getState();i&&(bo(new Map([[e,y]]),{x:0,y:0,width:n,height:r},t,!0).length>0||a(y.position.x+te.width/2,y.position.y+te.height/2,{zoom:t[2]}))};return(0,L.jsx)(`div`,{className:z([`react-flow__node`,`react-flow__node-${S}`,{[p]:w},y.className,{selected:y.selected,selectable:T,parent:x,draggable:w,dragging:j}]),ref:A,style:{zIndex:b.z,transform:`translate(${b.positionAbsolute.x}px,${b.positionAbsolute.y}px)`,pointerEvents:N?`all`:`none`,visibility:k?`visible`:`hidden`,...y.style,...M},"data-id":e,"data-testid":`rf__node-${e}`,onMouseEnter:ne,onMouseMove:re,onMouseLeave:ie,onContextMenu:P,onClick:oe,onDoubleClick:ae,onKeyDown:D?se:void 0,tabIndex:D?0:void 0,onFocus:D?ce:void 0,role:y.ariaRole??(D?`group`:void 0),"aria-roledescription":`node`,"aria-describedby":m?void 0:`${al}-${h}`,"aria-label":y.ariaLabel,...y.domAttributes,children:(0,L.jsx)(_u,{value:e,children:(0,L.jsx)(C,{id:e,data:y.data,type:S,positionAbsoluteX:b.positionAbsolute.x,positionAbsoluteY:b.positionAbsolute.y,selected:y.selected??!1,selectable:T,draggable:w,deletable:y.deletable??!0,isConnectable:E,sourcePosition:y.sourcePosition,targetPosition:y.targetPosition,dragging:j,dragHandle:y.dragHandle,zIndex:b.z,parentId:y.parentId,...te})})})}var Ku=(0,_.memo)(Gu),qu=e=>({nodesConnectable:e.nodesConnectable,nodesFocusable:e.nodesFocusable,elementsSelectable:e.elementsSelectable,onError:e.onError});function Ju(e){let{nodesConnectable:t,nodesFocusable:n,elementsSelectable:r,onError:i}=K(qu,Qc),a=Vu(e.onlyRenderVisibleElements),o=Uu();return(0,L.jsx)(`div`,{className:`react-flow__nodes`,style:iu,children:a.map(a=>(0,L.jsx)(Ku,{id:a,nodeTypes:e.nodeTypes,nodeExtent:e.nodeExtent,onClick:e.onNodeClick,onMouseEnter:e.onNodeMouseEnter,onMouseMove:e.onNodeMouseMove,onMouseLeave:e.onNodeMouseLeave,onContextMenu:e.onNodeContextMenu,onDoubleClick:e.onNodeDoubleClick,noDragClassName:e.noDragClassName,noPanClassName:e.noPanClassName,rfId:e.rfId,disableKeyboardA11y:e.disableKeyboardA11y,resizeObserver:o,nodesDraggable:e.nodesDraggable??!0,nodesConnectable:t,nodesFocusable:n,elementsSelectable:r,nodeClickDistance:e.nodeClickDistance,onError:i},a))})}Ju.displayName=`NodeRenderer`;var Yu=(0,_.memo)(Ju);function Xu(e){return K((0,_.useCallback)(t=>{if(!e)return t.edges.map(e=>e.id);let n=[];if(t.width&&t.height)for(let e of t.edges){let r=t.nodeLookup.get(e.source),i=t.nodeLookup.get(e.target);r&&i&&hs({sourceNode:r,targetNode:i,width:t.width,height:t.height,transform:t.transform})&&n.push(e.id)}return n},[e]),Qc)}var Zu=({color:e=`none`,strokeWidth:t=1})=>{let n={strokeWidth:t,...e&&{stroke:e}};return(0,L.jsx)(`polyline`,{className:`arrow`,style:n,strokeLinecap:`round`,fill:`none`,strokeLinejoin:`round`,points:`-5,-4 0,0 -5,4`})},J=({color:e=`none`,strokeWidth:t=1})=>{let n={strokeWidth:t,...e&&{stroke:e,fill:e}};return(0,L.jsx)(`polyline`,{className:`arrowclosed`,style:n,strokeLinecap:`round`,strokeLinejoin:`round`,points:`-5,-4 0,0 -5,4 -5,-4`})},Qu={[fo.Arrow]:Zu,[fo.ArrowClosed]:J};function Y(e){let t=nl();return(0,_.useMemo)(()=>Object.prototype.hasOwnProperty.call(Qu,e)?Qu[e]:(t.getState().onError?.(`009`,no.error009(e)),null),[e])}var X=({id:e,type:t,color:n,width:r=12.5,height:i=12.5,markerUnits:a=`strokeWidth`,strokeWidth:o,orient:s=`auto-start-reverse`})=>{let c=Y(t);return c?(0,L.jsx)(`marker`,{className:`react-flow__arrowhead`,id:e,markerWidth:`${r}`,markerHeight:`${i}`,viewBox:`-10 -10 20 20`,markerUnits:a,orient:s,refX:`0`,refY:`0`,children:(0,L.jsx)(c,{color:n,strokeWidth:o})}):null},Z=({defaultColor:e,rfId:t})=>{let n=K(e=>e.edges),r=K(e=>e.defaultEdgeOptions),i=(0,_.useMemo)(()=>Ms(n,{id:t,defaultColor:e,defaultMarkerStart:r?.markerStart,defaultMarkerEnd:r?.markerEnd}),[n,r,t,e]);return i.length?(0,L.jsx)(`svg`,{className:`react-flow__marker`,"aria-hidden":`true`,children:(0,L.jsx)(`defs`,{children:i.map(e=>(0,L.jsx)(X,{id:e.id,type:e.type,color:e.color,width:e.width,height:e.height,markerUnits:e.markerUnits,strokeWidth:e.strokeWidth,orient:e.orient},e.id))})}):null};Z.displayName=`MarkerDefinitions`;var $u=(0,_.memo)(Z);function ed({x:e,y:t,label:n,labelStyle:r,labelShowBg:i=!0,labelBgStyle:a,labelBgPadding:o=[2,4],labelBgBorderRadius:s=2,children:c,className:l,...u}){let[d,f]=(0,_.useState)({x:1,y:0,width:0,height:0}),p=z([`react-flow__edge-textwrapper`,l]),m=(0,_.useRef)(null);return(0,_.useEffect)(()=>{if(m.current){let e=m.current.getBBox();f({x:e.x,y:e.y,width:e.width,height:e.height})}},[n]),n?(0,L.jsxs)(`g`,{transform:`translate(${e-d.width/2} ${t-d.height/2})`,className:p,visibility:d.width?`visible`:`hidden`,...u,children:[i&&(0,L.jsx)(`rect`,{width:d.width+2*o[0],x:-o[0],y:-o[1],height:d.height+2*o[1],className:`react-flow__edge-textbg`,style:a,rx:s,ry:s}),(0,L.jsx)(`text`,{className:`react-flow__edge-text`,y:d.height/2,dy:`0.3em`,ref:m,style:r,children:n}),c]}):null}ed.displayName=`EdgeText`;var td=(0,_.memo)(ed);function nd({path:e,labelX:t,labelY:n,label:r,labelStyle:i,labelShowBg:a,labelBgStyle:o,labelBgPadding:s,labelBgBorderRadius:c,interactionWidth:l=20,...u}){return(0,L.jsxs)(L.Fragment,{children:[(0,L.jsx)(`path`,{...u,d:e,fill:`none`,className:z([`react-flow__edge-path`,u.className])}),l?(0,L.jsx)(`path`,{d:e,fill:`none`,strokeOpacity:0,strokeWidth:l,className:`react-flow__edge-interaction`}):null,r&&Bo(t)&&Bo(n)?(0,L.jsx)(td,{x:t,y:n,label:r,labelStyle:i,labelShowBg:a,labelBgStyle:o,labelBgPadding:s,labelBgBorderRadius:c}):null]})}function rd({pos:e,x1:t,y1:n,x2:r,y2:i}){return e===H.Left||e===H.Right?[.5*(t+r),n]:[t,.5*(n+i)]}function id({sourceX:e,sourceY:t,sourcePosition:n=H.Bottom,targetX:r,targetY:i,targetPosition:a=H.Top}){let[o,s]=rd({pos:n,x1:e,y1:t,x2:r,y2:i}),[c,l]=rd({pos:a,x1:r,y1:i,x2:e,y2:t}),[u,d,f,p]=ls({sourceX:e,sourceY:t,targetX:r,targetY:i,sourceControlX:o,sourceControlY:s,targetControlX:c,targetControlY:l});return[`M${e},${t} C${o},${s} ${c},${l} ${r},${i}`,u,d,f,p]}function ad(e){return(0,_.memo)(({id:t,sourceX:n,sourceY:r,targetX:i,targetY:a,sourcePosition:o,targetPosition:s,label:c,labelStyle:l,labelShowBg:u,labelBgStyle:d,labelBgPadding:f,labelBgBorderRadius:p,style:m,markerEnd:h,markerStart:g,interactionWidth:_})=>{let[v,y,b]=id({sourceX:n,sourceY:r,sourcePosition:o,targetX:i,targetY:a,targetPosition:s}),x=e.isInternal?void 0:t;return(0,L.jsx)(nd,{id:x,path:v,labelX:y,labelY:b,label:c,labelStyle:l,labelShowBg:u,labelBgStyle:d,labelBgPadding:f,labelBgBorderRadius:p,style:m,markerEnd:h,markerStart:g,interactionWidth:_})})}var od=ad({isInternal:!1}),sd=ad({isInternal:!0});od.displayName=`SimpleBezierEdge`,sd.displayName=`SimpleBezierEdgeInternal`;function cd(e){return(0,_.memo)(({id:t,sourceX:n,sourceY:r,targetX:i,targetY:a,label:o,labelStyle:s,labelShowBg:c,labelBgStyle:l,labelBgPadding:u,labelBgBorderRadius:d,style:f,sourcePosition:p=H.Bottom,targetPosition:m=H.Top,markerEnd:h,markerStart:g,pathOptions:_,interactionWidth:v})=>{let[y,b,x]=Ts({sourceX:n,sourceY:r,sourcePosition:p,targetX:i,targetY:a,targetPosition:m,borderRadius:_?.borderRadius,offset:_?.offset,stepPosition:_?.stepPosition}),S=e.isInternal?void 0:t;return(0,L.jsx)(nd,{id:S,path:y,labelX:b,labelY:x,label:o,labelStyle:s,labelShowBg:c,labelBgStyle:l,labelBgPadding:u,labelBgBorderRadius:d,style:f,markerEnd:h,markerStart:g,interactionWidth:v})})}var ld=cd({isInternal:!1}),ud=cd({isInternal:!0});ld.displayName=`SmoothStepEdge`,ud.displayName=`SmoothStepEdgeInternal`;function dd(e){return(0,_.memo)(({id:t,...n})=>{let r=e.isInternal?void 0:t;return(0,L.jsx)(ld,{...n,id:r,pathOptions:(0,_.useMemo)(()=>({borderRadius:0,offset:n.pathOptions?.offset}),[n.pathOptions?.offset])})})}var fd=dd({isInternal:!1}),pd=dd({isInternal:!0});fd.displayName=`StepEdge`,pd.displayName=`StepEdgeInternal`;function md(e){return(0,_.memo)(({id:t,sourceX:n,sourceY:r,targetX:i,targetY:a,label:o,labelStyle:s,labelShowBg:c,labelBgStyle:l,labelBgPadding:u,labelBgBorderRadius:d,style:f,markerEnd:p,markerStart:m,interactionWidth:h})=>{let[g,_,v]=ys({sourceX:n,sourceY:r,targetX:i,targetY:a}),y=e.isInternal?void 0:t;return(0,L.jsx)(nd,{id:y,path:g,labelX:_,labelY:v,label:o,labelStyle:s,labelShowBg:c,labelBgStyle:l,labelBgPadding:u,labelBgBorderRadius:d,style:f,markerEnd:p,markerStart:m,interactionWidth:h})})}var hd=md({isInternal:!1}),gd=md({isInternal:!0});hd.displayName=`StraightEdge`,gd.displayName=`StraightEdgeInternal`;function _d(e){return(0,_.memo)(({id:t,sourceX:n,sourceY:r,targetX:i,targetY:a,sourcePosition:o=H.Bottom,targetPosition:s=H.Top,label:c,labelStyle:l,labelShowBg:u,labelBgStyle:d,labelBgPadding:f,labelBgBorderRadius:p,style:m,markerEnd:h,markerStart:g,pathOptions:_,interactionWidth:v})=>{let[y,b,x]=fs({sourceX:n,sourceY:r,sourcePosition:o,targetX:i,targetY:a,targetPosition:s,curvature:_?.curvature}),S=e.isInternal?void 0:t;return(0,L.jsx)(nd,{id:S,path:y,labelX:b,labelY:x,label:c,labelStyle:l,labelShowBg:u,labelBgStyle:d,labelBgPadding:f,labelBgBorderRadius:p,style:m,markerEnd:h,markerStart:g,interactionWidth:v})})}var vd=_d({isInternal:!1}),yd=_d({isInternal:!0});vd.displayName=`BezierEdge`,yd.displayName=`BezierEdgeInternal`;var bd={default:yd,straight:gd,step:pd,smoothstep:ud,simplebezier:sd},xd={sourceX:null,sourceY:null,targetX:null,targetY:null,sourcePosition:null,targetPosition:null,zIndex:void 0},Sd=(e,t,n)=>n===H.Left?e-t:n===H.Right?e+t:e,Cd=(e,t,n)=>n===H.Top?e-t:n===H.Bottom?e+t:e,wd=`react-flow__edgeupdater`;function Td({position:e,centerX:t,centerY:n,radius:r=10,onMouseDown:i,onMouseEnter:a,onMouseOut:o,type:s}){return(0,L.jsx)(`circle`,{onMouseDown:i,onMouseEnter:a,onMouseOut:o,className:z([wd,`${wd}-${s}`]),cx:Sd(t,r,e),cy:Cd(n,r,e),r,stroke:`transparent`,fill:`transparent`})}function Ed({isReconnectable:e,reconnectRadius:t,edge:n,sourceX:r,sourceY:i,targetX:a,targetY:o,sourcePosition:s,targetPosition:c,onReconnect:l,onReconnectStart:u,onReconnectEnd:d,setReconnecting:f,setUpdateHover:p}){let m=nl(),h=(e,t)=>{if(e.button!==0)return;let{autoPanOnConnect:r,domNode:i,connectionMode:a,connectionRadius:o,lib:s,onConnectStart:c,cancelConnection:p,nodeLookup:h,rfId:g,panBy:_,updateConnection:v}=m.getState(),y=t.type===`target`;fc.onPointerDown(e.nativeEvent,{autoPanOnConnect:r,connectionMode:a,connectionRadius:o,domNode:i,handleId:t.id,nodeId:t.nodeId,nodeLookup:h,isTarget:y,edgeUpdaterType:t.type,lib:s,flowId:g,cancelConnection:p,panBy:_,isValidConnection:(...e)=>m.getState().isValidConnection?.(...e)??!0,onConnect:e=>l?.(n,e),onConnectStart:(r,i)=>{f(!0),u?.(e,n,t.type),c?.(r,i)},onConnectEnd:(...e)=>m.getState().onConnectEnd?.(...e),onReconnectEnd:(e,r)=>{f(!1),d?.(e,n,t.type,r)},updateConnection:v,getTransform:()=>m.getState().transform,getFromHandle:()=>m.getState().connection.fromHandle,dragThreshold:m.getState().connectionDragThreshold,handleDomNode:e.currentTarget})},g=e=>h(e,{nodeId:n.target,id:n.targetHandle??null,type:`target`}),_=e=>h(e,{nodeId:n.source,id:n.sourceHandle??null,type:`source`}),v=()=>p(!0),y=()=>p(!1);return(0,L.jsxs)(L.Fragment,{children:[(e===!0||e===`source`)&&(0,L.jsx)(Td,{position:s,centerX:r,centerY:i,radius:t,onMouseDown:g,onMouseEnter:v,onMouseOut:y,type:`source`}),(e===!0||e===`target`)&&(0,L.jsx)(Td,{position:c,centerX:a,centerY:o,radius:t,onMouseDown:_,onMouseEnter:v,onMouseOut:y,type:`target`})]})}function Dd({id:e,edgesFocusable:t,edgesReconnectable:n,elementsSelectable:r,onClick:i,onDoubleClick:a,onContextMenu:o,onMouseEnter:s,onMouseMove:c,onMouseLeave:l,reconnectRadius:u,onReconnect:d,onReconnectStart:f,onReconnectEnd:p,rfId:m,edgeTypes:h,noPanClassName:g,onError:v,disableKeyboardA11y:y}){let b=K(t=>t.edgeLookup.get(e)),x=K(e=>e.defaultEdgeOptions);b=x?{...x,...b}:b;let S=b.type||`default`,C=h?.[S]||bd[S];C===void 0&&(v?.(`011`,no.error011(S)),S=`default`,C=h?.default||bd.default);let w=!!(b.focusable||t&&b.focusable===void 0),T=d!==void 0&&(b.reconnectable||n&&b.reconnectable===void 0),E=!!(b.selectable||r&&b.selectable===void 0),D=(0,_.useRef)(null),[O,k]=(0,_.useState)(!1),[A,j]=(0,_.useState)(!1),ee=nl(),{zIndex:te=b.zIndex,sourceX:M,sourceY:N,targetX:ne,targetY:re,sourcePosition:ie,targetPosition:P}=K((0,_.useCallback)(t=>{let n=t.nodeLookup.get(b.source),r=t.nodeLookup.get(b.target);if(!n||!r)return xd;let i=Ds({id:e,sourceNode:n,targetNode:r,sourceHandle:b.sourceHandle||null,targetHandle:b.targetHandle||null,connectionMode:t.connectionMode,onError:v}),a=ms({selected:b.selected,zIndex:b.zIndex,sourceNode:n,targetNode:r,elevateOnSelect:t.elevateEdgesOnSelect,zIndexMode:t.zIndexMode});return{...i||xd,zIndex:a}},[b.source,b.target,b.sourceHandle,b.targetHandle,b.selected,b.zIndex,v]),Qc),ae=(0,_.useMemo)(()=>b.markerStart?`url(\'#${js(b.markerStart,m)}\')`:void 0,[b.markerStart,m]),oe=(0,_.useMemo)(()=>b.markerEnd?`url(\'#${js(b.markerEnd,m)}\')`:void 0,[b.markerEnd,m]);if(b.hidden||M===null||N===null||ne===null||re===null)return null;let se=t=>{let{addSelectedEdges:n,unselectNodesAndEdges:r,multiSelectionActive:a}=ee.getState();E&&(ee.setState({nodesSelectionActive:!1}),b.selected&&a?(r({nodes:[],edges:[b]}),D.current?.blur()):n([e])),i&&i(t,b)},ce=a?e=>{a(e,{...b})}:void 0,le=o?e=>{o(e,{...b})}:void 0,ue=s?e=>{s(e,{...b})}:void 0,de=c?e=>{c(e,{...b})}:void 0,fe=l?e=>{l(e,{...b})}:void 0;return(0,L.jsx)(`svg`,{style:{zIndex:te},children:(0,L.jsxs)(`g`,{className:z([`react-flow__edge`,`react-flow__edge-${S}`,b.className,g,{selected:b.selected,animated:b.animated,inactive:!E&&!i,updating:O,selectable:E}]),onClick:se,onDoubleClick:ce,onContextMenu:le,onMouseEnter:ue,onMouseMove:de,onMouseLeave:fe,onKeyDown:w?t=>{if(!y&&io.includes(t.key)&&E){let{unselectNodesAndEdges:n,addSelectedEdges:r}=ee.getState();t.key===`Escape`?(D.current?.blur(),n({edges:[b]})):r([e])}}:void 0,tabIndex:w?0:void 0,role:b.ariaRole??(w?`group`:`img`),"aria-roledescription":`edge`,"data-id":e,"data-testid":`rf__edge-${e}`,"aria-label":b.ariaLabel===null?void 0:b.ariaLabel||`Edge from ${b.source} to ${b.target}`,"aria-describedby":w?`${ol}-${m}`:void 0,ref:D,...b.domAttributes,children:[!A&&(0,L.jsx)(C,{id:e,source:b.source,target:b.target,type:b.type,selected:b.selected,animated:b.animated,selectable:E,deletable:b.deletable??!0,label:b.label,labelStyle:b.labelStyle,labelShowBg:b.labelShowBg,labelBgStyle:b.labelBgStyle,labelBgPadding:b.labelBgPadding,labelBgBorderRadius:b.labelBgBorderRadius,sourceX:M,sourceY:N,targetX:ne,targetY:re,sourcePosition:ie,targetPosition:P,data:b.data,style:b.style,sourceHandleId:b.sourceHandle,targetHandleId:b.targetHandle,markerStart:ae,markerEnd:oe,pathOptions:`pathOptions`in b?b.pathOptions:void 0,interactionWidth:b.interactionWidth}),T&&(0,L.jsx)(Ed,{edge:b,isReconnectable:T,reconnectRadius:u,onReconnect:d,onReconnectStart:f,onReconnectEnd:p,sourceX:M,sourceY:N,targetX:ne,targetY:re,sourcePosition:ie,targetPosition:P,setUpdateHover:k,setReconnecting:j})]})})}var Od=(0,_.memo)(Dd),kd=e=>({edgesFocusable:e.edgesFocusable,edgesReconnectable:e.edgesReconnectable,elementsSelectable:e.elementsSelectable,connectionMode:e.connectionMode,onError:e.onError});function Ad({defaultMarkerColor:e,onlyRenderVisibleElements:t,rfId:n,edgeTypes:r,noPanClassName:i,onReconnect:a,onEdgeContextMenu:o,onEdgeMouseEnter:s,onEdgeMouseMove:c,onEdgeMouseLeave:l,onEdgeClick:u,reconnectRadius:d,onEdgeDoubleClick:f,onReconnectStart:p,onReconnectEnd:m,disableKeyboardA11y:h}){let{edgesFocusable:g,edgesReconnectable:_,elementsSelectable:v,onError:y}=K(kd,Qc),b=Xu(t);return(0,L.jsxs)(`div`,{className:`react-flow__edges`,children:[(0,L.jsx)($u,{defaultColor:e,rfId:n}),b.map(e=>(0,L.jsx)(Od,{id:e,edgesFocusable:g,edgesReconnectable:_,elementsSelectable:v,noPanClassName:i,onReconnect:a,onContextMenu:o,onMouseEnter:s,onMouseMove:c,onMouseLeave:l,onClick:u,reconnectRadius:d,onDoubleClick:f,onReconnectStart:p,onReconnectEnd:m,rfId:n,onError:y,edgeTypes:r,disableKeyboardA11y:h},e))]})}Ad.displayName=`EdgeRenderer`;var jd=(0,_.memo)(Ad),Md=e=>`translate(${e[0]}px,${e[1]}px) scale(${e[2]})`;function Nd({children:e}){let t=nl(),n=(0,_.useRef)(null),[r]=(0,_.useState)(()=>t.getState().transform);return ql(()=>{let e=null,r=()=>{let r=t.getState().transform;e&&r[0]===e[0]&&r[1]===e[1]&&r[2]===e[2]||(e=r,n.current&&(n.current.style.transform=Md(r)))};return r(),t.subscribe(r)},[t]),(0,L.jsx)(`div`,{ref:n,className:`react-flow__viewport xyflow__viewport react-flow__container`,style:{transform:Md(r)},children:e})}function Pd(e){let t=eu(),n=(0,_.useRef)(!1);(0,_.useEffect)(()=>{!n.current&&t.viewportInitialized&&e&&(setTimeout(()=>e(t),1),n.current=!0)},[e,t.viewportInitialized])}var Fd=e=>e.panZoom?.syncViewport;function Id(e){let t=K(Fd),n=nl();return(0,_.useEffect)(()=>{e&&(t?.(e),n.setState({transform:[e.x,e.y,e.zoom]}))},[e,t]),null}function Ld(e){return e.connection.inProgress?{...e.connection,to:Vo(e.connection.to,e.transform)}:{...e.connection}}function Rd(e){return e?t=>e(Ld(t)):Ld}function zd(e){return K(Rd(e),Qc)}var Bd=e=>({nodesConnectable:e.nodesConnectable,isValid:e.connection.isValid,inProgress:e.connection.inProgress,width:e.width,height:e.height});function Vd({containerStyle:e,style:t,type:n,component:r}){let{nodesConnectable:i,width:a,height:o,isValid:s,inProgress:c}=K(Bd,Qc);return a&&i&&c?(0,L.jsx)(`svg`,{style:e,width:a,height:o,className:`react-flow__connectionline react-flow__container`,children:(0,L.jsx)(`g`,{className:z([`react-flow__connection`,es(s)]),children:(0,L.jsx)(Hd,{style:t,type:n,CustomComponent:r,isValid:s})})}):null}var Hd=({style:e,type:t=uo.Bezier,CustomComponent:n,isValid:r})=>{let{inProgress:i,from:a,fromNode:o,fromHandle:s,fromPosition:c,to:l,toNode:u,toHandle:d,toPosition:f,pointer:p}=zd();if(!i)return;if(n)return(0,L.jsx)(n,{connectionLineType:t,connectionLineStyle:e,fromNode:o,fromHandle:s,fromX:a.x,fromY:a.y,toX:l.x,toY:l.y,fromPosition:c,toPosition:f,connectionStatus:es(r),toNode:u,toHandle:d,pointer:p});let m=``,h={sourceX:a.x,sourceY:a.y,sourcePosition:c,targetX:l.x,targetY:l.y,targetPosition:f};switch(t){case uo.Bezier:[m]=fs(h);break;case uo.SimpleBezier:[m]=id(h);break;case uo.Step:[m]=Ts({...h,borderRadius:0});break;case uo.SmoothStep:[m]=Ts(h);break;default:[m]=ys(h)}return(0,L.jsx)(`path`,{d:m,fill:`none`,className:`react-flow__connection-path`,style:e})};Hd.displayName=`ConnectionLine`;var Ud={};function Wd(e=Ud){(0,_.useRef)(e),nl(),(0,_.useEffect)(()=>{},[e])}function Gd(){nl(),(0,_.useRef)(!1),(0,_.useEffect)(()=>{},[])}function Kd({nodeTypes:e,edgeTypes:t,onInit:n,onNodeClick:r,onEdgeClick:i,onNodeDoubleClick:a,onEdgeDoubleClick:o,onNodeMouseEnter:s,onNodeMouseMove:c,onNodeMouseLeave:l,onNodeContextMenu:u,onSelectionContextMenu:d,onSelectionStart:f,onSelectionEnd:p,connectionLineType:m,connectionLineStyle:h,connectionLineComponent:g,connectionLineContainerStyle:_,selectionKeyCode:v,selectionOnDrag:y,selectionMode:b,multiSelectionKeyCode:x,panActivationKeyCode:S,zoomActivationKeyCode:C,deleteKeyCode:w,onlyRenderVisibleElements:T,elementsSelectable:E,defaultViewport:D,translateExtent:O,minZoom:k,maxZoom:A,preventScrolling:j,defaultMarkerColor:ee,zoomOnScroll:te,zoomOnPinch:M,panOnScroll:N,panOnScrollSpeed:ne,panOnScrollMode:re,zoomOnDoubleClick:ie,panOnDrag:P,autoPanOnSelection:ae,onPaneClick:oe,onPaneMouseEnter:se,onPaneMouseMove:ce,onPaneMouseLeave:le,onPaneScroll:ue,onPaneContextMenu:de,paneClickDistance:fe,nodeClickDistance:pe,onEdgeContextMenu:me,onEdgeMouseEnter:he,onEdgeMouseMove:F,onEdgeMouseLeave:I,reconnectRadius:ge,onReconnect:_e,onReconnectStart:ve,onReconnectEnd:ye,noDragClassName:R,noWheelClassName:be,noPanClassName:z,disableKeyboardA11y:xe,nodeExtent:Se,rfId:Ce,viewport:we,onViewportChange:Te,nodesDraggable:Ee}){return Wd(e),Wd(t),Gd(),Pd(n),Id(we),(0,L.jsx)(zu,{onPaneClick:oe,onPaneMouseEnter:se,onPaneMouseMove:ce,onPaneMouseLeave:le,onPaneContextMenu:de,onPaneScroll:ue,paneClickDistance:fe,deleteKeyCode:w,selectionKeyCode:v,selectionOnDrag:y,selectionMode:b,onSelectionStart:f,onSelectionEnd:p,multiSelectionKeyCode:x,panActivationKeyCode:S,zoomActivationKeyCode:C,elementsSelectable:E,zoomOnScroll:te,zoomOnPinch:M,zoomOnDoubleClick:ie,panOnScroll:N,panOnScrollSpeed:ne,panOnScrollMode:re,panOnDrag:P,autoPanOnSelection:ae,defaultViewport:D,translateExtent:O,minZoom:k,maxZoom:A,onSelectionContextMenu:d,preventScrolling:j,noDragClassName:R,noWheelClassName:be,noPanClassName:z,disableKeyboardA11y:xe,onViewportChange:Te,isControlledViewport:!!we,children:(0,L.jsxs)(Nd,{children:[(0,L.jsx)(jd,{edgeTypes:t,onEdgeClick:i,onEdgeDoubleClick:o,onReconnect:_e,onReconnectStart:ve,onReconnectEnd:ye,onlyRenderVisibleElements:T,onEdgeContextMenu:me,onEdgeMouseEnter:he,onEdgeMouseMove:F,onEdgeMouseLeave:I,reconnectRadius:ge,defaultMarkerColor:ee,noPanClassName:z,disableKeyboardA11y:xe,rfId:Ce}),(0,L.jsx)(Vd,{style:h,type:m,component:g,containerStyle:_}),(0,L.jsx)(`div`,{className:`react-flow__edgelabel-renderer`}),(0,L.jsx)(Yu,{nodeTypes:e,onNodeClick:r,onNodeDoubleClick:a,onNodeMouseEnter:s,onNodeMouseMove:c,onNodeMouseLeave:l,onNodeContextMenu:u,nodeClickDistance:pe,onlyRenderVisibleElements:T,noPanClassName:z,noDragClassName:R,disableKeyboardA11y:xe,nodeExtent:Se,rfId:Ce,nodesDraggable:Ee}),(0,L.jsx)(`div`,{className:`react-flow__viewport-portal`})]})})}Kd.displayName=`GraphView`;var qd=(0,_.memo)(Kd),Jd=U(`React Flow`,`https://reactflow.dev/`),Yd=({nodes:e,edges:t,defaultNodes:n,defaultEdges:r,width:i,height:a,fitView:o,fitViewOptions:s,minZoom:c=.5,maxZoom:l=2,nodeOrigin:u,nodeExtent:d,zIndexMode:f=`basic`}={})=>{let p=new Map,m=new Map,h=new Map,g=new Map,_=r??t??[],v=n??e??[],y=u??[0,0],b=d??ro;Xs(h,g,_);let{nodesInitialized:x}=Vs(v,p,m,{nodeOrigin:y,nodeExtent:b,zIndexMode:f}),S=[0,0,1];if(o&&i&&a){let{x:e,y:t,zoom:n}=Ko(yo(p,{filter:e=>!(!e.width&&!e.initialWidth||!e.height&&!e.initialHeight)}),i,a,c,l,s?.padding??.1);S=[e,t,n]}return{rfId:`1`,width:i??0,height:a??0,transform:S,nodes:v,nodesInitialized:x,nodeLookup:p,parentLookup:m,edges:_,edgeLookup:g,connectionLookup:h,onNodesChange:null,onEdgesChange:null,hasDefaultNodes:n!==void 0,hasDefaultEdges:r!==void 0,panZoom:null,minZoom:c,maxZoom:l,translateExtent:ro,nodeExtent:b,nodesSelectionActive:!1,userSelectionActive:!1,userSelectionRect:null,connectionMode:oo.Strict,domNode:null,paneDragging:!1,noPanClassName:`nopan`,nodeOrigin:y,nodeDragThreshold:1,connectionDragThreshold:1,snapGrid:[15,15],snapToGrid:!1,nodesDraggable:!0,nodesConnectable:!0,nodesFocusable:!0,edgesFocusable:!0,edgesReconnectable:!0,elementsSelectable:!0,elevateNodesOnSelect:!0,elevateEdgesOnSelect:!0,selectNodesOnDrag:!0,multiSelectionActive:!1,fitViewQueued:o??!1,fitViewOptions:s,fitViewResolver:null,connection:{...lo},connectionClickStartHandle:null,connectOnClick:!0,ariaLiveMessage:``,autoPanOnConnect:!0,autoPanOnNodeDrag:!0,autoPanOnNodeFocus:!0,autoPanSpeed:15,connectionRadius:20,onError:Jd,isValidConnection:void 0,onSelectionChangeHandlers:[],lib:`react`,debug:!1,ariaLabelConfig:ao,zIndexMode:f,defaultEdgeOptions:void 0,onNodesChangeMiddlewareMap:new Map,onEdgesChangeMiddlewareMap:new Map,onNodesDelete:void 0,onEdgesDelete:void 0,onDelete:void 0,onBeforeDelete:void 0,onViewportChangeStart:void 0,onViewportChange:void 0,onViewportChangeEnd:void 0,onNodeDragStart:void 0,onNodeDrag:void 0,onNodeDragStop:void 0,onSelectionDragStart:void 0,onSelectionDrag:void 0,onSelectionDragStop:void 0,onMoveStart:void 0,onMove:void 0,onMoveEnd:void 0,onConnect:void 0,onConnectStart:void 0,onConnectEnd:void 0,onClickConnectStart:void 0,onClickConnectEnd:void 0}},Xd=({nodes:e,edges:t,defaultNodes:n,defaultEdges:r,width:i,height:a,fitView:o,fitViewOptions:s,minZoom:c,maxZoom:l,nodeOrigin:u,nodeExtent:d,zIndexMode:f})=>Zc((p,m)=>{async function h(){let{nodeLookup:e,panZoom:t,fitViewOptions:n,fitViewResolver:r,width:i,height:a,minZoom:o,maxZoom:s}=m();t&&(await Co({nodes:e,width:i,height:a,panZoom:t,minZoom:o,maxZoom:s},n),r?.resolve(!0),p({fitViewResolver:null}))}return{...Yd({nodes:e,edges:t,width:i,height:a,fitView:o,fitViewOptions:s,minZoom:c,maxZoom:l,nodeOrigin:u,nodeExtent:d,defaultNodes:n,defaultEdges:r,zIndexMode:f}),setNodes:e=>{let{nodeLookup:t,parentLookup:n,nodeOrigin:r,nodeExtent:i,elevateNodesOnSelect:a,fitViewQueued:o,zIndexMode:s,nodesSelectionActive:c}=m(),{nodesInitialized:l,hasSelectedNodes:u}=Vs(e,t,n,{nodeOrigin:r,nodeExtent:i,elevateNodesOnSelect:a,checkEquality:!0,zIndexMode:s}),d=c&&u;o&&l?(h(),p({nodes:e,nodesInitialized:l,fitViewQueued:!1,fitViewOptions:void 0,nodesSelectionActive:d})):p({nodes:e,nodesInitialized:l,nodesSelectionActive:d})},setEdges:e=>{let{connectionLookup:t,edgeLookup:n}=m();Xs(t,n,e),p({edges:e})},setDefaultNodesAndEdges:(e,t)=>{if(e){let{setNodes:t}=m();t(e),p({hasDefaultNodes:!0})}if(t){let{setEdges:e}=m();e(t),p({hasDefaultEdges:!0})}},updateNodeInternals:e=>{let{triggerNodeChanges:t,nodeLookup:n,parentLookup:r,domNode:i,nodeOrigin:a,nodeExtent:o,debug:s,fitViewQueued:c,zIndexMode:l}=m(),{changes:u,updatedInternals:d}=qs(e,n,r,i,a,o,l);d&&(Rs(n,r,{nodeOrigin:a,nodeExtent:o,zIndexMode:l}),c?(h(),p({fitViewQueued:!1,fitViewOptions:void 0})):p({}),u?.length>0&&(s&&console.log(`React Flow: trigger node changes`,u),t?.(u)))},updateNodePositions:(e,t=!1)=>{let n=[],r=[],{nodeLookup:i,triggerNodeChanges:a,connection:o,updateConnection:s,onNodesChangeMiddlewareMap:c}=m();for(let[a,c]of e){let e=i.get(a),l=!!(e?.expandParent&&e?.parentId&&c?.position),u={id:a,type:`position`,position:l?{x:Math.max(0,c.position.x),y:Math.max(0,c.position.y)}:c.position,dragging:t};if(e&&o.inProgress&&o.fromNode.id===e.id){let t=ks(e,o.fromHandle,H.Left,!0);s({...o,from:t})}l&&e.parentId&&n.push({id:a,parentId:e.parentId,rect:{...c.internals.positionAbsolute,width:c.measured.width??0,height:c.measured.height??0}}),r.push(u)}if(n.length>0){let{parentLookup:e,nodeOrigin:t}=m(),a=Ks(n,i,e,t);r.push(...a)}for(let e of c.values())r=e(r);a(r)},triggerNodeChanges:e=>{let{onNodesChange:t,setNodes:n,nodes:r,hasDefaultNodes:i,debug:a}=m();e?.length&&(i&&n(Il(e,r)),a&&console.log(`React Flow: trigger node changes`,e),t?.(e))},triggerEdgeChanges:e=>{let{onEdgesChange:t,setEdges:n,edges:r,hasDefaultEdges:i,debug:a}=m();e?.length&&(i&&n(Ll(e,r)),a&&console.log(`React Flow: trigger edge changes`,e),t?.(e))},addSelectedNodes:e=>{let{multiSelectionActive:t,edgeLookup:n,nodeLookup:r,triggerNodeChanges:i,triggerEdgeChanges:a}=m();t?i(e.map(e=>Rl(e,!0))):(i(zl(r,new Set([...e]),!0)),a(zl(n)))},addSelectedEdges:e=>{let{multiSelectionActive:t,edgeLookup:n,nodeLookup:r,triggerNodeChanges:i,triggerEdgeChanges:a}=m();t?a(e.map(e=>Rl(e,!0))):(a(zl(n,new Set([...e]))),i(zl(r,new Set,!0)))},unselectNodesAndEdges:({nodes:e,edges:t}={})=>{let{edges:n,nodes:r,nodeLookup:i,triggerNodeChanges:a,triggerEdgeChanges:o}=m(),s=e||r,c=t||n,l=[];for(let e of s){if(!e.selected)continue;let t=i.get(e.id);t&&(t.selected=!1),l.push(Rl(e.id,!1))}let u=[];for(let e of c)e.selected&&u.push(Rl(e.id,!1));a(l),o(u)},setMinZoom:e=>{let{panZoom:t,maxZoom:n}=m();t?.setScaleExtent([e,n]),p({minZoom:e})},setMaxZoom:e=>{let{panZoom:t,minZoom:n}=m();t?.setScaleExtent([n,e]),p({maxZoom:e})},setTranslateExtent:e=>{m().panZoom?.setTranslateExtent(e),p({translateExtent:e})},resetSelectedElements:()=>{let{edges:e,nodes:t,triggerNodeChanges:n,triggerEdgeChanges:r,elementsSelectable:i}=m();if(!i)return;let a=t.reduce((e,t)=>t.selected?[...e,Rl(t.id,!1)]:e,[]),o=e.reduce((e,t)=>t.selected?[...e,Rl(t.id,!1)]:e,[]);n(a),r(o)},setNodeExtent:e=>{let{nodes:t,nodeLookup:n,parentLookup:r,nodeOrigin:i,elevateNodesOnSelect:a,nodeExtent:o,zIndexMode:s}=m();(e[0][0]!==o[0][0]||e[0][1]!==o[0][1]||e[1][0]!==o[1][0]||e[1][1]!==o[1][1])&&(Vs(t,n,r,{nodeOrigin:i,nodeExtent:e,elevateNodesOnSelect:a,checkEquality:!1,zIndexMode:s}),p({nodeExtent:e}))},panBy:e=>{let{transform:t,width:n,height:r,panZoom:i,translateExtent:a}=m();return Js({delta:e,panZoom:i,transform:t,translateExtent:a,width:n,height:r})},setCenter:async(e,t,n)=>{let{width:r,height:i,maxZoom:a,panZoom:o}=m();if(!o)return!1;let s=n?.zoom===void 0?a:n.zoom;return await o.setViewport({x:r/2-e*s,y:i/2-t*s,zoom:s},{duration:n?.duration,ease:n?.ease,interpolate:n?.interpolate}),!0},cancelConnection:()=>{p({connection:{...lo}})},updateConnection:e=>{p({connection:e})},reset:()=>p({...Yd()})}},Object.is);function Zd({initialNodes:e,initialEdges:t,defaultNodes:n,defaultEdges:r,initialWidth:i,initialHeight:a,initialMinZoom:o,initialMaxZoom:s,initialFitViewOptions:c,fitView:l,nodeOrigin:u,nodeExtent:d,zIndexMode:f,children:p}){let[m]=(0,_.useState)(()=>Xd({nodes:e,edges:t,defaultNodes:n,defaultEdges:r,width:i,height:a,fitView:l,minZoom:o,maxZoom:s,fitViewOptions:c,nodeOrigin:u,nodeExtent:d,zIndexMode:f}));return(0,L.jsx)(el,{value:m,children:(0,L.jsx)(Zl,{children:(0,L.jsx)(xu,{children:p})})})}function Qd({children:e,nodes:t,edges:n,defaultNodes:r,defaultEdges:i,width:a,height:o,fitView:s,fitViewOptions:c,minZoom:l,maxZoom:u,nodeOrigin:d,nodeExtent:f,zIndexMode:p}){return(0,_.useContext)($c)?(0,L.jsx)(L.Fragment,{children:e}):(0,L.jsx)(Zd,{initialNodes:t,initialEdges:n,defaultNodes:r,defaultEdges:i,initialWidth:a,initialHeight:o,fitView:s,initialFitViewOptions:c,initialMinZoom:l,initialMaxZoom:u,nodeOrigin:d,nodeExtent:f,zIndexMode:p,children:e})}var $d={width:`100%`,height:`100%`,overflow:`hidden`,position:`relative`,zIndex:0};function ef({nodes:e,edges:t,defaultNodes:n,defaultEdges:r,className:i,nodeTypes:a,edgeTypes:o,onNodeClick:s,onEdgeClick:c,onInit:l,onMove:u,onMoveStart:d,onMoveEnd:f,onConnect:p,onConnectStart:m,onConnectEnd:h,onClickConnectStart:g,onClickConnectEnd:v,onNodeMouseEnter:y,onNodeMouseMove:b,onNodeMouseLeave:x,onNodeContextMenu:S,onNodeDoubleClick:C,onNodeDragStart:w,onNodeDrag:T,onNodeDragStop:E,onNodesDelete:D,onEdgesDelete:O,onDelete:k,onSelectionChange:A,onSelectionDragStart:j,onSelectionDrag:ee,onSelectionDragStop:te,onSelectionContextMenu:M,onSelectionStart:N,onSelectionEnd:ne,onBeforeDelete:re,connectionMode:ie,connectionLineType:P=uo.Bezier,connectionLineStyle:ae,connectionLineComponent:oe,connectionLineContainerStyle:se,deleteKeyCode:ce=`Backspace`,selectionKeyCode:le=`Shift`,selectionOnDrag:ue=!1,selectionMode:de=co.Full,panActivationKeyCode:fe=`Space`,multiSelectionKeyCode:pe=qo()?`Meta`:`Control`,zoomActivationKeyCode:me=qo()?`Meta`:`Control`,snapToGrid:he,snapGrid:F,onlyRenderVisibleElements:I=!1,selectNodesOnDrag:ge,nodesDraggable:_e,autoPanOnNodeFocus:ve,nodesConnectable:ye,nodesFocusable:R,nodeOrigin:be=xl,edgesFocusable:xe,edgesReconnectable:Se,elementsSelectable:Ce=!0,defaultViewport:we=Sl,minZoom:Te=.5,maxZoom:Ee=2,translateExtent:De=ro,preventScrolling:Oe=!0,nodeExtent:ke,defaultMarkerColor:Ae=`#b1b1b7`,zoomOnScroll:je=!0,zoomOnPinch:Me=!0,panOnScroll:Ne=!1,panOnScrollSpeed:Pe=.5,panOnScrollMode:Fe=so.Free,zoomOnDoubleClick:Ie=!0,panOnDrag:Le=!0,onPaneClick:Re,onPaneMouseEnter:ze,onPaneMouseMove:Be,onPaneMouseLeave:Ve,onPaneScroll:He,onPaneContextMenu:Ue,paneClickDistance:We=1,nodeClickDistance:Ge=0,children:Ke,onReconnect:qe,onReconnectStart:Je,onReconnectEnd:Ye,onEdgeContextMenu:Xe,onEdgeDoubleClick:Ze,onEdgeMouseEnter:Qe,onEdgeMouseMove:$e,onEdgeMouseLeave:et,reconnectRadius:tt=10,onNodesChange:nt,onEdgesChange:rt,noDragClassName:it=`nodrag`,noWheelClassName:at=`nowheel`,noPanClassName:ot=`nopan`,fitView:st,fitViewOptions:ct,connectOnClick:lt,attributionPosition:ut,proOptions:dt,defaultEdgeOptions:ft,elevateNodesOnSelect:pt=!0,elevateEdgesOnSelect:mt=!1,disableKeyboardA11y:ht=!1,autoPanOnConnect:gt,autoPanOnNodeDrag:_t,autoPanOnSelection:vt=!0,autoPanSpeed:yt,connectionRadius:bt,isValidConnection:xt,onError:St,style:Ct,id:wt,nodeDragThreshold:Tt,connectionDragThreshold:Et,viewport:Dt,onViewportChange:Ot,width:kt,height:At,colorMode:jt=`light`,debug:Mt,onScroll:Nt,ariaLabelConfig:Pt,zIndexMode:Ft=`basic`,...It},Lt){let Rt=wt||`1`,zt=Ol(jt),Bt=(0,_.useCallback)(e=>{e.currentTarget.scrollTo({top:0,left:0,behavior:`instant`}),Nt?.(e)},[Nt]);return(0,L.jsx)(`div`,{"data-testid":`rf__wrapper`,...It,onScroll:Bt,style:{...Ct,...$d},ref:Lt,className:z([`react-flow`,i,zt]),id:wt,role:`application`,children:(0,L.jsxs)(Qd,{nodes:e,edges:t,width:kt,height:At,fitView:st,fitViewOptions:ct,minZoom:Te,maxZoom:Ee,nodeOrigin:be,nodeExtent:ke,zIndexMode:Ft,children:[(0,L.jsx)(El,{nodes:e,edges:t,defaultNodes:n,defaultEdges:r,onConnect:p,onConnectStart:m,onConnectEnd:h,onClickConnectStart:g,onClickConnectEnd:v,nodesDraggable:_e,autoPanOnNodeFocus:ve,nodesConnectable:ye,nodesFocusable:R,edgesFocusable:xe,edgesReconnectable:Se,elementsSelectable:Ce,elevateNodesOnSelect:pt,elevateEdgesOnSelect:mt,minZoom:Te,maxZoom:Ee,nodeExtent:ke,onNodesChange:nt,onEdgesChange:rt,snapToGrid:he,snapGrid:F,connectionMode:ie,translateExtent:De,connectOnClick:lt,defaultEdgeOptions:ft,fitView:st,fitViewOptions:ct,onNodesDelete:D,onEdgesDelete:O,onDelete:k,onNodeDragStart:w,onNodeDrag:T,onNodeDragStop:E,onSelectionDrag:ee,onSelectionDragStart:j,onSelectionDragStop:te,onMove:u,onMoveStart:d,onMoveEnd:f,noPanClassName:ot,nodeOrigin:be,rfId:Rt,autoPanOnConnect:gt,autoPanOnNodeDrag:_t,autoPanSpeed:yt,onError:St,connectionRadius:bt,isValidConnection:xt,selectNodesOnDrag:ge,nodeDragThreshold:Tt,connectionDragThreshold:Et,onBeforeDelete:re,debug:Mt,ariaLabelConfig:Pt,zIndexMode:Ft}),(0,L.jsx)(qd,{onInit:l,onNodeClick:s,onEdgeClick:c,onNodeMouseEnter:y,onNodeMouseMove:b,onNodeMouseLeave:x,onNodeContextMenu:S,onNodeDoubleClick:C,nodeTypes:a,edgeTypes:o,connectionLineType:P,connectionLineStyle:ae,connectionLineComponent:oe,connectionLineContainerStyle:se,selectionKeyCode:le,selectionOnDrag:ue,selectionMode:de,deleteKeyCode:ce,multiSelectionKeyCode:pe,panActivationKeyCode:fe,zoomActivationKeyCode:me,onlyRenderVisibleElements:I,defaultViewport:we,translateExtent:De,minZoom:Te,maxZoom:Ee,preventScrolling:Oe,zoomOnScroll:je,zoomOnPinch:Me,zoomOnDoubleClick:Ie,panOnScroll:Ne,panOnScrollSpeed:Pe,panOnScrollMode:Fe,panOnDrag:Le,autoPanOnSelection:vt,onPaneClick:Re,onPaneMouseEnter:ze,onPaneMouseMove:Be,onPaneMouseLeave:Ve,onPaneScroll:He,onPaneContextMenu:Ue,paneClickDistance:We,nodeClickDistance:Ge,onSelectionContextMenu:M,onSelectionStart:N,onSelectionEnd:ne,onReconnect:qe,onReconnectStart:Je,onReconnectEnd:Ye,onEdgeContextMenu:Xe,onEdgeDoubleClick:Ze,onEdgeMouseEnter:Qe,onEdgeMouseMove:$e,onEdgeMouseLeave:et,reconnectRadius:tt,defaultMarkerColor:Ae,noDragClassName:it,noWheelClassName:at,noPanClassName:ot,rfId:Rt,disableKeyboardA11y:ht,nodeExtent:ke,viewport:Dt,onViewportChange:Ot,nodesDraggable:_e}),(0,L.jsx)(bl,{onSelectionChange:A}),Ke,(0,L.jsx)(ml,{proOptions:dt,position:ut}),(0,L.jsx)(dl,{rfId:Rt,disableKeyboardA11y:ht})]})})}var tf=Kl(ef);no.error014();function nf({dimensions:e,lineWidth:t,variant:n,className:r}){return(0,L.jsx)(`path`,{strokeWidth:t,d:`M${e[0]/2} 0 V${e[1]} M0 ${e[1]/2} H${e[0]}`,className:z([`react-flow__background-pattern`,n,r])})}function rf({radius:e,className:t}){return(0,L.jsx)(`circle`,{cx:e,cy:e,r:e,className:z([`react-flow__background-pattern`,`dots`,t])})}var af;(function(e){e.Lines=`lines`,e.Dots=`dots`,e.Cross=`cross`})(af||={});var of={[af.Dots]:1,[af.Lines]:1,[af.Cross]:6},sf=e=>({transform:e.transform,patternId:`pattern-${e.rfId}`});function cf({id:e,variant:t=af.Dots,gap:n=20,size:r,lineWidth:i=1,offset:a=0,color:o,bgColor:s,style:c,className:l,patternClassName:u}){let d=(0,_.useRef)(null),{transform:f,patternId:p}=K(sf,Qc),m=r||of[t],h=t===af.Dots,g=t===af.Cross,v=Array.isArray(n)?n:[n,n],y=[v[0]*f[2]||1,v[1]*f[2]||1],b=m*f[2],x=Array.isArray(a)?a:[a,a],S=g?[b,b]:y,C=[x[0]*f[2]+S[0]/2,x[1]*f[2]+S[1]/2],w=`${p}${e||``}`;return(0,L.jsxs)(`svg`,{className:z([`react-flow__background`,l]),style:{...c,...iu,"--xy-background-color-props":s,"--xy-background-pattern-color-props":o},ref:d,"data-testid":`rf__background`,children:[(0,L.jsx)(`pattern`,{id:w,x:f[0]%y[0],y:f[1]%y[1],width:y[0],height:y[1],patternUnits:`userSpaceOnUse`,patternTransform:`translate(-${C[0]},-${C[1]})`,children:h?(0,L.jsx)(rf,{radius:b/2,className:u}):(0,L.jsx)(nf,{dimensions:S,lineWidth:i,variant:t,className:u})}),(0,L.jsx)(`rect`,{x:`0`,y:`0`,width:`100%`,height:`100%`,fill:`url(#${w})`})]})}cf.displayName=`Background`,(0,_.memo)(cf);function lf(){return(0,L.jsx)(`svg`,{xmlns:`http://www.w3.org/2000/svg`,viewBox:`0 0 32 32`,children:(0,L.jsx)(`path`,{d:`M32 18.133H18.133V32h-4.266V18.133H0v-4.266h13.867V0h4.266v13.867H32z`})})}function uf(){return(0,L.jsx)(`svg`,{xmlns:`http://www.w3.org/2000/svg`,viewBox:`0 0 32 5`,children:(0,L.jsx)(`path`,{d:`M0 0h32v4.2H0z`})})}function df(){return(0,L.jsx)(`svg`,{xmlns:`http://www.w3.org/2000/svg`,viewBox:`0 0 32 30`,children:(0,L.jsx)(`path`,{d:`M3.692 4.63c0-.53.4-.938.939-.938h5.215V0H4.708C2.13 0 0 2.054 0 4.63v5.216h3.692V4.631zM27.354 0h-5.2v3.692h5.17c.53 0 .984.4.984.939v5.215H32V4.631A4.624 4.624 0 0027.354 0zm.954 24.83c0 .532-.4.94-.939.94h-5.215v3.768h5.215c2.577 0 4.631-2.13 4.631-4.707v-5.139h-3.692v5.139zm-23.677.94c-.531 0-.939-.4-.939-.94v-5.138H0v5.139c0 2.577 2.13 4.707 4.708 4.707h5.138V25.77H4.631z`})})}function ff(){return(0,L.jsx)(`svg`,{xmlns:`http://www.w3.org/2000/svg`,viewBox:`0 0 25 32`,children:(0,L.jsx)(`path`,{d:`M21.333 10.667H19.81V7.619C19.81 3.429 16.38 0 12.19 0 8 0 4.571 3.429 4.571 7.619v3.048H3.048A3.056 3.056 0 000 13.714v15.238A3.056 3.056 0 003.048 32h18.285a3.056 3.056 0 003.048-3.048V13.714a3.056 3.056 0 00-3.048-3.047zM12.19 24.533a3.056 3.056 0 01-3.047-3.047 3.056 3.056 0 013.047-3.048 3.056 3.056 0 013.048 3.048 3.056 3.056 0 01-3.048 3.047zm4.724-13.866H7.467V7.619c0-2.59 2.133-4.724 4.723-4.724 2.591 0 4.724 2.133 4.724 4.724v3.048z`})})}function pf(){return(0,L.jsx)(`svg`,{xmlns:`http://www.w3.org/2000/svg`,viewBox:`0 0 25 32`,children:(0,L.jsx)(`path`,{d:`M21.333 10.667H19.81V7.619C19.81 3.429 16.38 0 12.19 0c-4.114 1.828-1.37 2.133.305 2.438 1.676.305 4.42 2.59 4.42 5.181v3.048H3.047A3.056 3.056 0 000 13.714v15.238A3.056 3.056 0 003.048 32h18.285a3.056 3.056 0 003.048-3.048V13.714a3.056 3.056 0 00-3.048-3.047zM12.19 24.533a3.056 3.056 0 01-3.047-3.047 3.056 3.056 0 013.047-3.048 3.056 3.056 0 013.048 3.048 3.056 3.056 0 01-3.048 3.047z`})})}function mf({children:e,className:t,...n}){return(0,L.jsx)(`button`,{type:`button`,className:z([`react-flow__controls-button`,t]),...n,children:e})}var hf=e=>({isInteractive:e.nodesDraggable||e.nodesConnectable||e.elementsSelectable,minZoomReached:e.transform[2]<=e.minZoom,maxZoomReached:e.transform[2]>=e.maxZoom,ariaLabelConfig:e.ariaLabelConfig});function gf({style:e,showZoom:t=!0,showFitView:n=!0,showInteractive:r=!0,fitViewOptions:i,onZoomIn:a,onZoomOut:o,onFitView:s,onInteractiveChange:c,className:l,children:u,position:d=`bottom-left`,orientation:f=`vertical`,"aria-label":p}){let m=nl(),{isInteractive:h,minZoomReached:g,maxZoomReached:_,ariaLabelConfig:v}=K(hf,Qc),{zoomIn:y,zoomOut:b,fitView:x}=eu();return(0,L.jsxs)(fl,{className:z([`react-flow__controls`,f===`horizontal`?`horizontal`:`vertical`,l]),position:d,style:e,"data-testid":`rf__controls`,"aria-label":p??v[`controls.ariaLabel`],children:[t&&(0,L.jsxs)(L.Fragment,{children:[(0,L.jsx)(mf,{onClick:()=>{y(),a?.()},className:`react-flow__controls-zoomin`,title:v[`controls.zoomIn.ariaLabel`],"aria-label":v[`controls.zoomIn.ariaLabel`],disabled:_,children:(0,L.jsx)(lf,{})}),(0,L.jsx)(mf,{onClick:()=>{b(),o?.()},className:`react-flow__controls-zoomout`,title:v[`controls.zoomOut.ariaLabel`],"aria-label":v[`controls.zoomOut.ariaLabel`],disabled:g,children:(0,L.jsx)(uf,{})})]}),n&&(0,L.jsx)(mf,{className:`react-flow__controls-fitview`,onClick:()=>{x(i),s?.()},title:v[`controls.fitView.ariaLabel`],"aria-label":v[`controls.fitView.ariaLabel`],children:(0,L.jsx)(df,{})}),r&&(0,L.jsx)(mf,{className:`react-flow__controls-interactive`,onClick:()=>{m.setState({nodesDraggable:!h,nodesConnectable:!h,elementsSelectable:!h}),c?.(!h)},title:v[`controls.interactive.ariaLabel`],"aria-label":v[`controls.interactive.ariaLabel`],children:h?(0,L.jsx)(pf,{}):(0,L.jsx)(ff,{})}),u]})}gf.displayName=`Controls`;var _f=(0,_.memo)(gf);function vf({id:e,x:t,y:n,width:r,height:i,style:a,color:o,strokeColor:s,strokeWidth:c,className:l,borderRadius:u,shapeRendering:d,selected:f,onClick:p}){let{background:m,backgroundColor:h}=a||{},g=o||m||h;return(0,L.jsx)(`rect`,{className:z([`react-flow__minimap-node`,{selected:f},l]),x:t,y:n,rx:u,ry:u,width:r,height:i,style:{fill:g,stroke:s,strokeWidth:c},shapeRendering:d,onClick:p?t=>p(t,e):void 0})}var yf=(0,_.memo)(vf),bf=e=>e.nodes.map(e=>e.id),xf=e=>e instanceof Function?e:()=>e;function Sf({nodeStrokeColor:e,nodeColor:t,nodeClassName:n=``,nodeBorderRadius:r=5,nodeStrokeWidth:i,nodeComponent:a=yf,onClick:o}){let s=K(bf,Qc),c=xf(t),l=xf(e),u=xf(n),d=typeof window>`u`||window.chrome?`crispEdges`:`geometricPrecision`;return(0,L.jsx)(L.Fragment,{children:s.map(e=>(0,L.jsx)(wf,{id:e,nodeColorFunc:c,nodeStrokeColorFunc:l,nodeClassNameFunc:u,nodeBorderRadius:r,nodeStrokeWidth:i,NodeComponent:a,onClick:o,shapeRendering:d},e))})}function Cf({id:e,nodeColorFunc:t,nodeStrokeColorFunc:n,nodeClassNameFunc:r,nodeBorderRadius:i,nodeStrokeWidth:a,shapeRendering:o,NodeComponent:s,onClick:c}){let{node:l,x:u,y:d,width:f,height:p}=K(t=>{let n=t.nodeLookup.get(e);if(!n)return{node:void 0,x:0,y:0,width:0,height:0};let r=n.internals.userNode,{x:i,y:a}=n.internals.positionAbsolute,{width:o,height:s}=G(r);return{node:r,x:i,y:a,width:o,height:s}},Qc);return!l||l.hidden||!Yo(l)?null:(0,L.jsx)(s,{x:u,y:d,width:f,height:p,style:l.style,selected:!!l.selected,className:r(l),color:t(l),borderRadius:i,strokeColor:n(l),strokeWidth:a,shapeRendering:o,onClick:c,id:l.id})}var wf=(0,_.memo)(Cf),Tf=(0,_.memo)(Sf),Ef=200,Df=150,Of=e=>!e.hidden,kf=e=>{let t={x:-e.transform[0]/e.transform[2],y:-e.transform[1]/e.transform[2],width:e.width/e.transform[2],height:e.height/e.transform[2]},n=!1;for(let t of e.nodeLookup.values())if(!t.hidden){n=!0;break}return{viewBB:t,boundingRect:n?Io(yo(e.nodeLookup,{filter:Of}),t):t,rfId:e.rfId,panZoom:e.panZoom,translateExtent:e.translateExtent,flowWidth:e.width,flowHeight:e.height,ariaLabelConfig:e.ariaLabelConfig}},Af=(e,t)=>e.x===t.x&&e.y===t.y&&e.width===t.width&&e.height===t.height,jf=(e,t)=>Af(e.viewBB,t.viewBB)&&Af(e.boundingRect,t.boundingRect)&&e.rfId===t.rfId&&e.panZoom===t.panZoom&&e.translateExtent===t.translateExtent&&e.flowWidth===t.flowWidth&&e.flowHeight===t.flowHeight&&e.ariaLabelConfig===t.ariaLabelConfig,Mf=`react-flow__minimap-desc`;function Nf({style:e,className:t,nodeStrokeColor:n,nodeColor:r,nodeClassName:i=``,nodeBorderRadius:a=5,nodeStrokeWidth:o,nodeComponent:s,bgColor:c,maskColor:l,maskStrokeColor:u,maskStrokeWidth:d,position:f=`bottom-right`,onClick:p,onNodeClick:m,pannable:h=!1,zoomable:g=!1,ariaLabel:v,inversePan:y,zoomStep:b=1,offsetScale:x=5}){let S=nl(),C=(0,_.useRef)(null),{boundingRect:w,panZoom:T,viewBB:E,rfId:D,translateExtent:O,flowWidth:k,flowHeight:A,ariaLabelConfig:j}=K(kf,jf),ee=e?.width??Ef,te=e?.height??Df,M=w.width/ee,N=w.height/te,ne=Math.max(M,N),re=ne*ee,ie=ne*te,P=x*ne,ae=w.x-(re-w.width)/2-P,oe=w.y-(ie-w.height)/2-P,se=re+P*2,ce=ie+P*2,le=`${Mf}-${D}`,ue=(0,_.useRef)(0),de=(0,_.useRef)();ue.current=ne,(0,_.useEffect)(()=>{let e=S.getState().panZoom;if(C.current&&e)return de.current=pc({domNode:C.current,panZoom:e,getTransform:()=>S.getState().transform,getViewScale:()=>ue.current}),()=>{de.current?.destroy()}},[T]),(0,_.useEffect)(()=>{de.current?.update({translateExtent:O,width:k,height:A,inversePan:y,pannable:h,zoomStep:b,zoomable:g})},[h,g,y,b,O,k,A]);let fe=p?e=>{let[t,n]=de.current?.pointer(e)||[0,0];p(e,{x:t,y:n})}:void 0,pe=(0,_.useCallback)((e,t)=>{let n=S.getState().nodeLookup.get(t).internals.userNode;m?.(e,n)},[m]),me=m?pe:void 0,he=v??j[`minimap.ariaLabel`];return(0,L.jsx)(fl,{position:f,style:{...e,"--xy-minimap-background-color-props":typeof c==`string`?c:void 0,"--xy-minimap-mask-background-color-props":typeof l==`string`?l:void 0,"--xy-minimap-mask-stroke-color-props":typeof u==`string`?u:void 0,"--xy-minimap-mask-stroke-width-props":typeof d==`number`?d*ne:void 0,"--xy-minimap-node-background-color-props":typeof r==`string`?r:void 0,"--xy-minimap-node-stroke-color-props":typeof n==`string`?n:void 0,"--xy-minimap-node-stroke-width-props":typeof o==`number`?o:void 0},className:z([`react-flow__minimap`,t]),"data-testid":`rf__minimap`,children:(0,L.jsxs)(`svg`,{width:ee,height:te,viewBox:`${ae} ${oe} ${se} ${ce}`,className:`react-flow__minimap-svg`,role:`img`,"aria-labelledby":le,ref:C,onClick:fe,children:[he&&(0,L.jsx)(`title`,{id:le,children:he}),(0,L.jsx)(Tf,{onClick:me,nodeColor:r,nodeStrokeColor:n,nodeBorderRadius:a,nodeClassName:i,nodeStrokeWidth:o,nodeComponent:s}),(0,L.jsx)(`path`,{className:`react-flow__minimap-mask`,d:`M${ae-P},${oe-P}h${se+P*2}v${ce+P*2}h${-se-P*2}z\n        M${E.x},${E.y}h${E.width}v${E.height}h${-E.width}z`,fillRule:`evenodd`,pointerEvents:`none`})]})})}Nf.displayName=`MiniMap`,(0,_.memo)(Nf);var Pf=e=>t=>e?`${Math.max(1/t.transform[2],1)}`:void 0,Ff={[Oc.Line]:`right`,[Oc.Handle]:`bottom-right`};function If({nodeId:e,position:t,variant:n=Oc.Handle,className:r,style:i=void 0,children:a,color:o,minWidth:s=10,minHeight:c=10,maxWidth:l=Number.MAX_VALUE,maxHeight:u=Number.MAX_VALUE,keepAspectRatio:d=!1,resizeDirection:f,autoScale:p=!0,shouldResize:m,onResizeStart:h,onResize:g,onResizeEnd:v}){let y=vu(),b=typeof e==`string`?e:y,x=nl(),S=(0,_.useRef)(null),C=n===Oc.Handle,w=K((0,_.useCallback)(Pf(C&&p),[C,p]),Qc),T=(0,_.useRef)(null),E=t??Ff[n];(0,_.useEffect)(()=>{if(S.current&&b)return T.current||=zc({domNode:S.current,nodeId:b,getStoreItems:()=>{let{nodeLookup:e,transform:t,snapGrid:n,snapToGrid:r,nodeOrigin:i,domNode:a}=x.getState();return{nodeLookup:e,transform:t,snapGrid:n,snapToGrid:r,nodeOrigin:i,paneDomNode:a}},onChange:(e,t)=>{let{triggerNodeChanges:n,nodeLookup:r,parentLookup:i,nodeOrigin:a}=x.getState(),o=[],s={x:e.x,y:e.y},c=r.get(b);if(c&&c.expandParent&&c.parentId){let t=c.origin??a,n=e.width??c.measured.width??0,l=e.height??c.measured.height??0,u=Ks([{id:c.id,parentId:c.parentId,rect:{width:n,height:l,...Xo({x:e.x??c.position.x,y:e.y??c.position.y},{width:n,height:l},c.parentId,r,t)}}],r,i,a);o.push(...u),s.x=e.x?Math.max(t[0]*n,e.x):void 0,s.y=e.y?Math.max(t[1]*l,e.y):void 0}if(s.x!==void 0&&s.y!==void 0){let e={id:b,type:`position`,position:{...s}};o.push(e)}if(e.width!==void 0&&e.height!==void 0){let t={id:b,type:`dimensions`,resizing:!0,setAttributes:f?f===`horizontal`?`width`:`height`:!0,dimensions:{width:e.width,height:e.height}};o.push(t)}for(let e of t){let t={...e,type:`position`};o.push(t)}n(o)},onEnd:({width:e,height:t})=>{let n={id:b,type:`dimensions`,resizing:!1,dimensions:{width:e,height:t}};x.getState().triggerNodeChanges([n])}}),T.current.update({controlPosition:E,boundaries:{minWidth:s,minHeight:c,maxWidth:l,maxHeight:u},keepAspectRatio:d,resizeDirection:f,onResizeStart:h,onResize:g,onResizeEnd:v,shouldResize:m}),()=>{T.current?.destroy()}},[E,s,c,l,u,d,h,g,v,m]);let D=E.split(`-`);return(0,L.jsx)(`div`,{className:z([`react-flow__resize-control`,`nodrag`,...D,n,r]),ref:S,style:{...i,scale:w,...o&&{[C?`backgroundColor`:`borderColor`]:o}},children:a})}(0,_.memo)(If);function Lf(e){return e.added+e.removed}function Rf(e,t){return Lf(e)>=t}function zf(e,t){let n=[];for(let r of e)for(let e of r.nodes)e.kind===`message`&&e.change!==void 0&&(t.has(e.id)||n.push({sessionId:r.sessionId,sessionTitle:r.title,sessionStartedAt:r.startedAt,messageId:e.id,label:e.label??e.id,title:e.title,...e.at===void 0?{}:{at:e.at},change:e.change}));return n.sort((e,t)=>Lf(t.change)-Lf(e.change)||t.change.files-e.change.files||e.title.localeCompare(t.title)||e.messageId.localeCompare(t.messageId))}function Bf(e,t){return zf(e.map(e=>({...e,nodes:e.messages})),t)}function Vf(e){return String(Math.max(0,Math.trunc(e))).replace(/\\B(?=(\\d{3})+(?!\\d))/g,` `)}function Q(e){let t=`${e.files} file${e.files===1?``:`s`}`;return`+${Vf(e.added)} \u2212${Vf(e.removed)} \xB7 ${t}`}var Hf=e=>String(e).padStart(2,`0`);function Uf(e){if(!e)return`\u2014`;let t=new Date(e);return Number.isNaN(t.getTime())?e:`${t.getFullYear()}-${Hf(t.getMonth()+1)}-${Hf(t.getDate())} ${Hf(t.getHours())}:${Hf(t.getMinutes())}`}function Wf(e){if(!e)return`\u2014`;let t=new Date(e);return Number.isNaN(t.getTime())?e:`${Hf(t.getMonth()+1)}-${Hf(t.getDate())}`}function Gf(e){if(!e)return`\u2014`;let t=new Date(e);return Number.isNaN(t.getTime())?e:`${Hf(t.getMonth()+1)}-${Hf(t.getDate())} ${Hf(t.getHours())}:${Hf(t.getMinutes())}`}function Kf(e){if(!e)return null;let t=new Date(e);return Number.isNaN(t.getTime())?null:t.toDateString()}function qf(e){let t=new Date(e);return Number.isNaN(t.getTime())?e:`${Hf(t.getHours())}:${Hf(t.getMinutes())}`}function Jf(e){return e===`phase`?`topic`:e===`message`?`you`:e}function Yf(e,t){return{...e,sessionId:t,nodeId:e.id}}function Xf(e){let t=Date.parse(e);return Number.isNaN(t)?-1/0:t}function Zf(e){return e.sessions.sort((e,t)=>Xf(t.updatedAt)-Xf(e.updatedAt)||e.sessionId.localeCompare(t.sessionId))[0]}function Qf(e){let t=null;for(let n of e.sessions)for(let e of n.messages){let r=Xf(e.at??``);r!==-1/0&&(t===null||r>t.at)&&(t={sessionId:n.sessionId,messageId:e.id,at:r})}if(t!==null)return{sessionId:t.sessionId,messageId:t.messageId};let n=Zf(e);return n?{sessionId:n.sessionId,messageId:n.messages[n.messages.length-1]?.id??null}:null}function $f(e){return`session:${e}`}function ep(e){return/^h[0-9a-f]{12}$/.test(e)}function $(e){return ep(e)?e.slice(0,8):e}function tp(e,t){return`node:${e}:${t}`}function np(e,t){let n=e.findIndex(e=>e.id===t);return n<0?{previous:null,next:null}:{previous:e[n-1]??null,next:e[n+1]??null}}function rp(e,t,n){let r=t.height/2-e.y*n,{left:i,right:a}=e;return i!==void 0&&a!==void 0?(a-i)*n>t.width-48?{zoom:n,y:r,x:24-i*n}:{zoom:n,y:r,x:t.width/2-(i+a)/2*n}:{zoom:n,y:r,x:t.width/2-e.x*n}}function ip({files:e,active:t,onSelect:n,onClose:r}){let i=e??[],[a,o]=(0,_.useState)(null),s=t===null?null:i.find(e=>e.hits.some(e=>e.sessionId===t.sessionId&&e.messageId===t.messageId))?.path??null;return(0,_.useEffect)(()=>{s!==null&&o(s)},[s]),(0,L.jsxs)(`nav`,{className:`outline files-view`,"aria-label":`File history`,children:[(0,L.jsxs)(`header`,{className:`outline-head`,children:[(0,L.jsx)(`span`,{className:`outline-title`,children:`Files`}),(0,L.jsx)(`span`,{className:`outline-badge`,children:i.length}),(0,L.jsx)(`button`,{type:`button`,className:`drilldown-close`,"aria-label":`Hide files`,onClick:r,children:`\xD7`})]}),(0,L.jsx)(`div`,{className:`outline-scroll`,children:i.length===0?(0,L.jsx)(`p`,{className:`empty`,children:`No files recorded yet. The agent lists the files each message touched.`}):(0,L.jsx)(`ul`,{className:`outline-list`,children:i.map(e=>{let r=a===e.path;return(0,L.jsxs)(`li`,{children:[(0,L.jsxs)(`div`,{className:`outline-row`,children:[(0,L.jsx)(`button`,{type:`button`,className:`outline-toggle`,"aria-expanded":r,"aria-label":r?`Collapse`:`Expand`,onClick:()=>o(r?null:e.path),children:r?`\u25BE`:`\u25B8`}),(0,L.jsxs)(`button`,{type:`button`,className:`outline-item file-row${s===e.path?` is-active`:``}`,title:e.path,onClick:()=>o(r?null:e.path),children:[(0,L.jsx)(`span`,{className:`label file-path`,children:e.path}),(0,L.jsx)(`span`,{className:`outline-count`,children:e.count})]})]}),r?(0,L.jsx)(`ul`,{className:`file-hits`,children:e.hits.map(e=>{let r=t?.sessionId===e.sessionId&&t.messageId===e.messageId;return(0,L.jsx)(`li`,{children:(0,L.jsxs)(`button`,{type:`button`,className:`file-hit${r?` is-active`:``}`,onClick:()=>n({sessionId:e.sessionId,messageId:e.messageId}),children:[(0,L.jsxs)(`span`,{className:`file-hit-line`,children:[(0,L.jsx)(`span`,{className:`file-hit-time`,children:Gf(e.at??null)}),(0,L.jsx)(`span`,{className:`file-hash`,children:$(e.messageId)}),(0,L.jsx)(`span`,{className:`file-label`,children:e.label}),(0,L.jsx)(`span`,{className:`file-hit-title`,children:e.title})]}),(0,L.jsxs)(`span`,{className:`file-hit-meta`,children:[(0,L.jsx)(`span`,{className:`file-hit-session`,children:e.sessionTitle}),e.branch===void 0?null:(0,L.jsxs)(`span`,{className:`file-hit-branch`,children:[`\u256D `,e.branch]}),e.commits.length===0?null:(0,L.jsx)(`span`,{className:`file-hit-commit`,children:e.commits.map(e=>e.slice(0,7)).join(` `)})]})]})},`${e.sessionId}:${e.messageId}`)})}):null]},e.path)})})})]})}function ap(){let[e,t]=(0,_.useState)(!1),n=(0,_.useCallback)(()=>{t(!1),document.fullscreenElement&&document.exitFullscreen().catch(()=>{})},[]),r=(0,_.useCallback)(()=>{if(e)return n();t(!0),document.documentElement.requestFullscreen?.().catch(()=>{})},[e,n]);return(0,_.useEffect)(()=>{if(!e)return;let r=e=>{e.key===`Escape`&&n()},i=()=>{document.fullscreenElement||t(!1)};return document.addEventListener(`keydown`,r),document.addEventListener(`fullscreenchange`,i),()=>{document.removeEventListener(`keydown`,r),document.removeEventListener(`fullscreenchange`,i)}},[e,n]),{expanded:e,toggle:r}}var op=10,sp=6,cp=8,lp=1600;function up(e){return typeof e!=`number`||!Number.isFinite(e)?520:Math.round(Math.min(lp,Math.max(360,e)))}function dp(e){return e.commitTags&&e.commitTags.length>0?e.commitTags.map(e=>e.subject===void 0?{hash:e.hash,short:e.hash.slice(0,7),missing:!0}:{hash:e.hash,short:e.hash.slice(0,7),subject:e.subject,missing:!1}):(e.commits??[]).map(e=>({hash:e,short:e.slice(0,7),missing:!0}))}var fp=6.4,pp=16,mp=56,hp=18,gp=106;function _p(e,t,n=520){let r=gp+(e.label??e.id).length*7+Math.min(t.tags,2)*mp+(t.head?92:0)+(e.unsummarized?116:0),i=Math.max(180,n-r),a=Math.max(1,Math.ceil(e.title.length*fp/i)),o=Math.ceil(t.tags/2);return Math.max(30,12+Math.max(a*pp,o*hp))}function vp(e,t){let n=e.parent;if(typeof n!=`string`)return null;let r=t.get(e.id)??0,i=t.get(n);return i!==void 0&&i<r?n:null}function yp(e,t){let n=t.get(e[0]??``),r=t.get(e[e.length-1]??``);return{title:(n?.branch?.title??n?.title??e[0]??``).slice(0,80),asked:n?.branch?.asked??``,outcome:n?.branch?.outcome??n?.summary??``,open:n?.branch?.open??``,fromId:e[0]??``,toId:e[e.length-1]??``,fromLabel:n?.label??e[0]??``,toLabel:r?.label??e[e.length-1]??``,count:e.length,...n?.at===void 0?{}:{firstAt:n.at},...r?.at===void 0?{}:{lastAt:r.at}}}function bp(e,t={}){let n=t.rowWidth??520,r=new Map(e.map((e,t)=>[e.id,t])),i=new Map(e.map(e=>[e.id,e])),a=new Map,o=new Map;for(let t of e){let e=vp(t,r);o.set(t.id,e);let n=a.get(e)??[];n.push(t.id),a.set(e,n)}let s=e=>a.get(e)??[],c=[],l=new Map,u=(e,t)=>{let n=[e],r=e;for(;s(r).length===1;)r=s(r)[0],n.push(r);let a=n[n.length-1],d={id:e,ids:n,parentId:o.get(e)??null,parentSegmentId:t?.id??null,lane:0,parentLane:null,colorIndex:c.length%6,branch:yp(n,i),startY:0,parentY:null};c.push(d);for(let e of n)l.set(e,d);for(let e of s(a))u(e,d);return d};for(let e of s(null))u(e,null);let d=`headId`in t?t.headId:e[e.length-1]?.id??null,f=t.unfolded??new Set,p=t.openAll??!1,m=t.fold??!0,h=[];for(let e of c)if(m&&e.ids.length>4&&!p&&!f.has(e.id)&&!(d!==null&&e.ids.includes(d))){let t=e.ids[0],n=e.ids[e.ids.length-1],i=e.ids.slice(1,-1);h.push({kind:`message`,index:r.get(t)??0,segment:e,id:t,y:0,height:30,gap:!1}),h.push({kind:`more`,index:(r.get(t)??0)+.5,segment:e,hidden:i,y:0,height:30,gap:!1}),h.push({kind:`message`,index:r.get(n)??0,segment:e,id:n,y:0,height:30,gap:!1})}else for(let t of e.ids)h.push({kind:`message`,index:r.get(t)??0,segment:e,id:t,y:0,height:30,gap:!1});h.sort((e,t)=>e.index-t.index);let g=15,_=new Map;h.forEach((e,r)=>{e.gap=r>0&&e.kind===`message`&&e.segment.parentId===null&&e.segment.ids[0]===e.id,e.gap&&(g+=24);let a=e.kind===`message`?i.get(e.id??``):void 0;e.height=a?_p(a,{tags:dp(a).length,head:a.id===d},n):30,e.y=g+e.height/2,g+=e.height;let o=e.kind===`message`?t.spaceAfter?.get(e.id??``):void 0;o!==void 0&&o>0&&(e.spaceTop=g,g+=o),e.kind===`message`&&e.id&&_.set(e.id,e);for(let t of e.hidden??[])_.set(t,e)});let v=new Map(c.map(e=>[e.id,e])),y=new Map,b=[...c].sort((e,t)=>(r.get(e.id)??0)-(r.get(t.id)??0));for(let e of b){let n=_.get(e.ids[0]??``),a=_.get(e.ids[e.ids.length-1]??``);if(!n||!a)continue;let o=(e.parentId===null?null:r.get(e.parentId)??null)??r.get(e.ids[0]??``)??0,s=(r.get(e.ids[e.ids.length-1]??``)??0)+.1;if(t.itemEnd)for(let n of e.ids){let e=i.get(n),r=e?t.itemEnd(e):null;r!==null&&(s=Math.max(s,r))}let c=[o,s],l=e=>!(y.get(e)??[]).some(([e,t])=>e<c[1]&&c[0]<t),u=e.parentSegmentId===null?null:v.get(e.parentSegmentId),d=u&&l(u.lane)?u.lane:0;for(;!l(d);)d+=1;e.lane=d,e.parentLane=u?.lane??null,e.startY=n.y,e.parentY=(e.parentId===null?null:_.get(e.parentId)?.y)??null;let f=y.get(d)??[];f.push(c),y.set(d,f)}let x=Math.max(0,...c.map(e=>e.lane+1)),S=Array.from({length:Math.max(x,1)},(e,t)=>op+t*20),C=op+Math.max(x,1)*20+sp;return{segments:c,rows:h.map(e=>{if(e.kind===`more`)return{kind:`more`,segmentId:e.segment.id,colorIndex:e.segment.colorIndex,y:e.y,height:e.height,hidden:e.hidden??[]};let t=i.get(e.id??``);if(!t)throw Error(`message ${String(e.id)} vanished from the layout`);return{kind:`message`,message:t,segmentId:e.segment.id,colorIndex:e.segment.colorIndex,y:e.y,first:e.segment.ids[0]===t.id,gap:e.gap,tags:dp(t),head:t.id===d,height:e.height,...e.spaceTop===void 0?{}:{spaceTop:e.spaceTop}}}),laneX:S,graphWidth:C,rowWidth:n,width:C+cp+n,height:g,headId:d}}function xp(e,t){let n=t[e.lane]??0,r=e.parentY;if(r===null)return``;let i=e.parentLane===null?n:t[e.parentLane]??n;return i===n?`M${n},${r} L${n},${e.startY}`:[`M${i},${r}`,`C${i},${r+21} ${n},${r+9} ${n},${r+30}`,`L${n},${e.startY}`].join(` `)}function Sp(e){return`var(--l${e%6})`}function Cp(e,t){return e.kind===`more`||!e.message.at?``:t?qf(e.message.at):Gf(e.message.at)}function wp({row:e,sameDay:t,selected:n,searchHit:r,searchActive:i,read:a,bigChangeLines:o,onSelect:s,onUnfold:c}){let l={top:e.y-e.height/2,height:e.height};if(e.kind===`more`)return(0,L.jsx)(`button`,{type:`button`,className:`git-row git-more`,style:l,onClick:t=>{t.stopPropagation(),c(e.segmentId)},title:`Show the folded messages of this branch`,children:(0,L.jsxs)(`span`,{className:`git-title`,children:[`\u22EE `,e.hidden.length,` more \u2014 open`]})});let u=e.message,d=u.change!==void 0&&!a&&Rf(u.change,o),f=[`git-row`,n?`is-selected`:``,r?`is-search-hit`:``,i?`is-search-active`:``,d?`is-unread-big`:``].filter(Boolean).join(` `);return(0,L.jsxs)(`button`,{type:`button`,className:f,style:l,"data-message":u.id,onClick:t=>{t.stopPropagation(),s(e)},title:u.summary||u.title,children:[(0,L.jsx)(`span`,{className:`git-time`,children:Cp(e,t)}),(0,L.jsx)(`span`,{className:`git-id`,children:u.label??u.id}),(0,L.jsx)(`span`,{className:`git-title`,children:u.title}),e.tags.length>0?(0,L.jsx)(`span`,{className:`git-tags`,children:e.tags.map(t=>(0,L.jsx)(`span`,{className:`git-tag${t.missing?` is-missing`:``}`,title:t.missing?`commit ${t.short} is not in this repository`:`${t.short} ${t.subject??``}`,onClick:t=>{t.stopPropagation(),s(e)},children:t.short},t.hash))}):null,u.change?(0,L.jsx)(`span`,{className:`git-change`,title:`The commits linked to this message changed ${u.change.added} lines added, ${u.change.removed} removed${a?` (read)`:``}`,children:Q(u.change)}):null,e.head?(0,L.jsx)(`span`,{className:`left-off`,children:`left off here`}):null,u.unsummarized?(0,L.jsx)(`span`,{className:`unsummarized`,children:`not summarized yet`}):null]})}function Tp({git:e,selectedId:t,highlightIds:n,activeHitId:r,readIds:i,bigChangeLines:a,onSelect:o,onUnfold:s}){let c=(0,_.useMemo)(()=>new Map(e.segments.map(e=>[e.id,e])),[e.segments]);return(0,L.jsxs)(`div`,{className:`git-graph`,style:{width:e.width,height:e.height},children:[(0,L.jsxs)(`svg`,{className:`git-lanes`,width:e.graphWidth,height:e.height,"aria-hidden":`true`,focusable:`false`,children:[e.segments.map(t=>{let n=xp(t,e.laneX),r=e.rows.filter(e=>e.segmentId===t.id),i=e.laneX[t.lane]??0;return(0,L.jsxs)(`g`,{stroke:Sp(t.colorIndex),fill:`none`,children:[n?(0,L.jsx)(`path`,{d:n,strokeWidth:2.5}):null,r.slice(1).map((e,t)=>{let n=r[t];if(!n)return null;let a=n.kind===`more`||e.kind===`more`;return(0,L.jsx)(`path`,{d:`M${i},${n.y} L${i},${e.y}`,strokeWidth:a?6:2.5,opacity:a?.3:1},`${e.segmentId}-${t}`)})]},t.id)}),e.rows.map(t=>{if(t.kind!==`message`)return null;let n=e.laneX[c.get(t.segmentId)?.lane??0]??0;return t.first?(0,L.jsx)(`circle`,{cx:n,cy:t.y,r:6,fill:`var(--bg)`,stroke:Sp(t.colorIndex),strokeWidth:3},t.message.id):(0,L.jsx)(`circle`,{cx:n,cy:t.y,r:4.5,fill:Sp(t.colorIndex)},t.message.id)}),e.rows.map(t=>{if(t.kind!==`message`)return null;let n=e.laneX[c.get(t.segmentId)?.lane??0]??0;return(0,L.jsx)(`circle`,{className:`git-dot-hit nodrag nopan`,cx:n,cy:t.y,r:10,fill:`transparent`,onClick:e=>{e.stopPropagation(),o(t)}},`${t.message.id}-hit`)})]}),(0,L.jsx)(`div`,{className:`git-rows`,style:{left:e.graphWidth+8,width:e.rowWidth},children:e.rows.map((c,l)=>{let u=c.kind===`message`?c.message.id:null,d=e.rows[l-1],f=c.kind===`message`?Kf(c.message.at):null,p=f!==null&&d?.kind===`message`&&Kf(d.message.at)===f;return(0,L.jsx)(wp,{row:c,sameDay:p,selected:u!==null&&t!==null&&u===t,searchHit:u!==null&&n?.has(u)===!0,searchActive:u!==null&&r!==null&&u===r,read:u!==null&&i.has(u),bigChangeLines:a,onSelect:o,onUnfold:s},c.kind===`more`?`${c.segmentId}-more`:c.message.id)})})]})}function Ep(e,t){for(let n of e.sessions){let e=$f(n.sessionId);if(e===t)return[e];if(n.messages.some(n=>tp(e,n.id)===t))return[e,t]}return null}function Dp({id:e,hasChildren:t,expanded:n,onToggle:r}){return t?(0,L.jsx)(`button`,{type:`button`,className:`outline-toggle`,"aria-expanded":n,"aria-label":n?`Collapse`:`Expand`,onClick:()=>r(e),children:n?`\u25BE`:`\u25B8`}):(0,L.jsx)(`span`,{className:`outline-toggle is-empty`,"aria-hidden":`true`})}function Op({session:e,activeId:t,expanded:n,onToggle:r,onSelect:i}){let a=$f(e.sessionId),o=e.messages.length>0,s=o&&n.has(a);return(0,L.jsxs)(`li`,{children:[(0,L.jsxs)(`div`,{className:`outline-row`,children:[(0,L.jsx)(Dp,{id:a,hasChildren:o,expanded:n.has(a),onToggle:r}),(0,L.jsxs)(`button`,{type:`button`,className:`outline-item${t===a?` is-active`:``}`,onClick:()=>i({sessionId:e.sessionId,focusId:a,selection:{type:`session`,sessionId:e.sessionId}}),children:[(0,L.jsx)(`span`,{className:`label`,children:e.title||e.sessionId}),(0,L.jsx)(`span`,{className:`outline-count`,children:e.messages.length})]})]}),s?(0,L.jsx)(`ul`,{children:e.messages.map(n=>{let r=tp(a,n.id);return(0,L.jsx)(`li`,{children:(0,L.jsxs)(`div`,{className:`outline-row`,children:[(0,L.jsx)(`span`,{className:`outline-toggle is-empty`,"aria-hidden":`true`}),(0,L.jsxs)(`button`,{type:`button`,className:`outline-item${t===r?` is-active`:``}`,onClick:()=>i({sessionId:e.sessionId,focusId:r,selection:{type:`node`,sessionId:e.sessionId,nodeId:n.id}}),children:[n.kind===`message`?null:(0,L.jsx)(`span`,{className:`kind kind-${n.kind}`,children:Jf(n.kind)}),(0,L.jsx)(`span`,{className:`label`,children:n.title})]})]})},r)})}):null]})}function kp({model:e,activeId:t,onSelect:n,onClose:r}){let[i,a]=(0,_.useState)(()=>new Set);(0,_.useEffect)(()=>{if(!t)return;let n=Ep(e,t);if(!n)return;let r=n.slice(0,-1);r.length!==0&&a(e=>{if(r.every(t=>e.has(t)))return e;let t=new Set(e);for(let e of r)t.add(e);return t})},[t,e]);let o=e=>{a(t=>{let n=new Set(t);return n.has(e)?n.delete(e):n.add(e),n})};return(0,L.jsxs)(`nav`,{className:`outline`,"aria-label":`Project outline`,children:[(0,L.jsxs)(`header`,{className:`outline-head`,children:[(0,L.jsx)(`span`,{className:`outline-title`,children:`Outline`}),(0,L.jsx)(`button`,{type:`button`,className:`drilldown-close`,"aria-label":`Hide outline`,onClick:r,children:`\xD7`})]}),(0,L.jsx)(`div`,{className:`outline-scroll`,children:e.sessions.length===0?(0,L.jsx)(`p`,{className:`empty`,children:`No sessions recorded yet.`}):(0,L.jsx)(`ul`,{className:`outline-list`,children:e.sessions.map(e=>(0,L.jsx)(Op,{session:e,activeId:t,expanded:i,onToggle:o,onSelect:n},e.sessionId))})})]})}function Ap(e,t){return e.authorEmail!==void 0&&t.authorEmail!==void 0?e.authorEmail.toLowerCase()===t.authorEmail.toLowerCase():e.author!==void 0&&t.author!==void 0?e.author===t.author:!0}function jp(e){return e.author??e.authorEmail}function Mp(e){return e.authorEmail?.toLowerCase()??e.author}function Np(e){let t=e.viewer,n=t!==void 0&&Mp(t)!==void 0,r=new Map;for(let i of e.sessions){let e=Mp(i),a=jp(i);e!==void 0&&a!==void 0&&(n&&Ap(i,t)||r.has(e)||r.set(e,a))}let i=e=>n&&Mp(e)!==void 0?Ap(e,t):void 0;return{mine:i,showAuthor(e){if(e.author===void 0)return!1;let t=i(e);return t===void 0?r.size>1:!t},matches(e,t){return t===null?!0:t===`you`?i(e)!==!1:Mp(e)===t.key},options(){let e=[...r].map(([e,t])=>({value:`person:${e}`,label:t}));return e.length===0||!n&&e.length<2?[]:[{value:`everyone`,label:`Everyone`},...n?[{value:`you`,label:`You`}]:[],...e]}}}function Pp(e){return e===`you`?`you`:e.startsWith(`person:`)?{key:e.slice(7)}:null}function Fp(e){return e===null?`everyone`:e===`you`?`you`:`person:${e.key}`}var Ip=12;function Lp(e){if(typeof e!=`object`||!e||Array.isArray(e))return{};let t={};for(let[n,r]of Object.entries(e))typeof r==`number`&&(t[n]=up(r));return t}function Rp(e,t){try{t?e.currentTarget.setPointerCapture(e.pointerId):e.currentTarget.releasePointerCapture(e.pointerId)}catch{}}function zp({git:e,onResize:t,onDone:n}){let r=K(e=>e.transform[2])||1,[i,a]=(0,_.useState)(null),o=Ip/r;return(0,L.jsx)(`span`,{className:`row-edge nodrag nopan${i?` is-dragging`:``}`,role:`separator`,"aria-orientation":`vertical`,"aria-label":`Resize the message rows`,title:`Drag to make the rows wider or narrower \xB7 double-click to reset`,style:{left:e.width-o/2,width:o,height:e.height},onPointerDown:t=>{t.stopPropagation(),Rp(t,!0),a({x:t.clientX,width:e.rowWidth})},onPointerMove:e=>{i&&t(up(i.width+(e.clientX-i.x)/r))},onPointerUp:e=>{i&&(Rp(e,!1),a(null),n(up(i.width+(e.clientX-i.x)/r)))},onDoubleClick:e=>{e.stopPropagation(),t(520),n(520)}})}function Bp(e){return`var(--l${e%6})`}function Vp({row:e,session:t,showAuthor:n,dimmed:r,selected:i,open:a,searchHit:o,onOpen:s,onContinue:c}){let l=t.messages[0]?.continues,u={top:e.y-e.height/2,height:e.height},d=t.messages.length,f=[`git-row session-row`,i?`is-selected`:``,a?`is-open`:``,o?`is-search-hit`:``,r?`is-dimmed`:``].filter(Boolean).join(` `);return(0,L.jsxs)(`button`,{type:`button`,className:f,style:u,"aria-expanded":a,onClick:e=>{e.stopPropagation(),s(t.sessionId)},title:t.status.goal||t.title,children:[(0,L.jsx)(`span`,{className:`session-toggle`,"aria-hidden":`true`,children:a?`\u25BE`:`\u25B8`}),(0,L.jsx)(`span`,{className:`git-time`,children:t.startedAt?Gf(t.startedAt):``}),(0,L.jsx)(`span`,{className:`git-title`,children:t.title||t.sessionId}),n&&t.author?(0,L.jsx)(`span`,{className:`muted session-author`,title:`Recorded by ${t.author}`,children:t.author}):null,(0,L.jsxs)(`span`,{className:`muted session-count`,children:[d,` message`,d===1?``:`s`]}),t.unrecordedMessages?(0,L.jsxs)(`span`,{className:`muted unrecorded`,title:`The side model at session end is off`,children:[t.unrecordedMessages,` not recorded`]}):null,l?(0,L.jsxs)(`span`,{className:`git-continues`,title:`Open ${l.sessionTitle} at ${l.label??l.id}`,onClick:e=>{e.stopPropagation(),c(l)},children:[`\u2191 `,l.label??l.id]}):null,e.head?(0,L.jsx)(`span`,{className:`left-off`,children:`left off here`}):null]})}function Hp({model:e,graph:t,selectedSessionId:n,openIds:r,highlightSessionIds:i,person:a=null,onOpen:o,onContinue:s}){let{git:c}=t,l=new Map(c.segments.map(e=>[e.id,e])),u=Np(e),d=e=>{e.kind===`message`&&o(e.message.id)};return(0,L.jsxs)(`div`,{className:`git-graph session-map`,style:{width:c.width,height:c.height},children:[(0,L.jsxs)(`svg`,{className:`git-lanes`,width:c.graphWidth,height:c.height,"aria-hidden":`true`,focusable:`false`,children:[c.segments.map(e=>{let t=xp(e,c.laneX),n=c.rows.filter(t=>t.segmentId===e.id),r=c.laneX[e.lane]??0;return(0,L.jsxs)(`g`,{stroke:Bp(e.colorIndex),fill:`none`,children:[t?(0,L.jsx)(`path`,{d:t,strokeWidth:2.5}):null,n.slice(1).map((e,t)=>{let i=n[t];return i?(0,L.jsx)(`path`,{d:`M${r},${i.y} L${r},${e.y}`,strokeWidth:2.5},`${e.segmentId}-${t}`):null})]},e.id)}),c.rows.map(e=>{if(e.kind!==`message`||e.spaceTop===void 0)return null;let t=c.laneX[l.get(e.segmentId)?.lane??0]??0,n=e.spaceTop+18;return(0,L.jsx)(`path`,{d:`M${t},${e.y} L${t},${n} L${c.graphWidth+4},${n}`,stroke:Bp(e.colorIndex),strokeWidth:1.5,strokeDasharray:`3 3`,fill:`none`},`${e.message.id}-open`)}),c.rows.map(e=>{if(e.kind!==`message`)return null;let t=c.laneX[l.get(e.segmentId)?.lane??0]??0;return e.first?(0,L.jsx)(`circle`,{cx:t,cy:e.y,r:6,fill:`var(--bg)`,stroke:Bp(e.colorIndex),strokeWidth:3,className:`session-dot`,onClick:()=>d(e)},e.message.id):(0,L.jsx)(`circle`,{cx:t,cy:e.y,r:4.5,fill:Bp(e.colorIndex),className:`session-dot`,onClick:()=>d(e)},e.message.id)})]}),(0,L.jsx)(`div`,{className:`git-rows`,style:{left:c.graphWidth+8,width:c.rowWidth},children:c.rows.map(e=>{let c=e.kind===`message`?t.sessions.get(e.message.id):void 0;return e.kind!==`message`||!c?null:(0,L.jsx)(Vp,{row:e,session:c,showAuthor:u.showAuthor(c),dimmed:!u.matches(c,a),selected:n===c.sessionId,open:r.has(c.sessionId),searchHit:i.has(c.sessionId),onOpen:o,onContinue:e=>s(e.sessionId,e.id)},e.message.id)})})]})}async function Up(e){try{if(navigator.clipboard?.writeText)return await navigator.clipboard.writeText(e),!0}catch{}try{let t=document.createElement(`textarea`);t.value=e,t.setAttribute(`readonly`,``),t.style.position=`fixed`,t.style.top=`-1000px`,t.style.opacity=`0`,document.body.appendChild(t),t.select();let n=document.execCommand(`copy`);return t.remove(),n}catch{return!1}}var Wp=/^([a-z]+)(?:\\(([^)]+)\\))?(!)?:\\s+(.+)$/;function Gp(e){let t=Wp.exec(e);if(!t)return{breaking:!1,text:e};let[,n,r,i,a]=t;return{type:n,...r?{scope:r}:{},breaking:i===`!`,text:a}}var Kp={feat:1,fix:5,docs:4,refactor:3,perf:3,test:2};function qp(e){return Kp[e]}function Jp(e){let t=e.lastIndexOf(`/`);return t<0?{dir:``,name:e}:{dir:e.slice(0,t+1),name:e.slice(t+1)}}function Yp(e){let t=[],n=null,r=null,i=0,a=0;for(let o of e.split(/\\r?\\n/))if(o.startsWith(`diff --git `))n={path:/^diff --git a\\/(.+) b\\/(.+)$/.exec(o)?.[2]??o.slice(11),meta:[],hunks:[],binary:!1},t.push(n),r=null;else if(n!==null){if(o.startsWith(`Binary files `)&&o.endsWith(` differ`))n.binary=!0;else if(o.startsWith(`@@`)){let e=/^@@+ -(\\d+)(?:,\\d+)? \\+(\\d+)(?:,\\d+)? @@/.exec(o);i=Number(e?.[1]??0),a=Number(e?.[2]??0),r={header:o,lines:[]},n.hunks.push(r)}else if(r!==null){if(o===``)continue;if(o.startsWith(`\\\\`)){r.lines.push({kind:`note`,text:o,oldNo:null,newNo:null});continue}let e=o[0];if(e===`+`){r.lines.push({kind:`add`,text:o.slice(1),oldNo:null,newNo:a}),a+=1;continue}if(e===`-`){r.lines.push({kind:`remove`,text:o.slice(1),oldNo:i,newNo:null}),i+=1;continue}if(e===` `){r.lines.push({kind:`context`,text:o.slice(1),oldNo:i,newNo:a}),i+=1,a+=1;continue}r.lines.push({kind:`note`,text:o,oldNo:null,newNo:null})}else if(o.startsWith(`+++ `)){let e=o.slice(4);e!==`/dev/null`&&(n.path=e.replace(/^b\\//,``))}else o!==``&&n.meta.push(o)}return t}function Xp(e,t,n){return{kind:t,no:n,text:e.text}}function Zp(e){let t=[],n=0;for(;n<e.length;){let r=e[n];if(r.kind===`note`){t.push({left:null,right:null,note:r.text}),n+=1;continue}if(r.kind===`context`){t.push({left:Xp(r,`context`,r.oldNo),right:Xp(r,`context`,r.newNo)}),n+=1;continue}let i=[],a=[];for(;n<e.length&&e[n].kind===`remove`;)i.push(e[n]),n+=1;for(;n<e.length&&e[n].kind===`add`;)a.push(e[n]),n+=1;let o=Math.max(i.length,a.length);for(let e=0;e<o;e+=1){let n=i[e],r=a[e];t.push({left:n===void 0?null:Xp(n,`remove`,n.oldNo),right:r===void 0?null:Xp(r,`add`,r.newNo)})}}return t}var Qp=`cogit.diffSideBySide`;function $p(){try{return window.localStorage.getItem(Qp)===`1`}catch{return!1}}function em(e){try{window.localStorage.setItem(Qp,e?`1`:`0`)}catch{}}function tm({hunk:e,side:t}){return t?(0,L.jsxs)(L.Fragment,{children:[(0,L.jsx)(`div`,{className:`diff-hunk diff-hunk-side`,children:(0,L.jsx)(`span`,{children:e.header})}),Zp(e.lines).map((t,n)=>(0,L.jsx)(`div`,{className:`diff-row diff-side-row`,children:t.note===void 0?(0,L.jsxs)(L.Fragment,{children:[(0,L.jsx)(`span`,{className:`diff-no diff-side-no${t.left?.kind===`remove`?` is-old`:``}`,children:t.left?.no??``}),(0,L.jsx)(`span`,{className:`diff-cell${t.left?` diff-${t.left.kind}`:` is-empty`}`,children:t.left?.text??``}),(0,L.jsx)(`span`,{className:`diff-no diff-side-no${t.right?.kind===`add`?` is-new`:``}`,children:t.right?.no??``}),(0,L.jsx)(`span`,{className:`diff-cell${t.right?` diff-${t.right.kind}`:` is-empty`}`,children:t.right?.text??``})]}):(0,L.jsx)(`span`,{className:`diff-note-line`,children:t.note})},`${e.header}-side-${n}`))]}):(0,L.jsxs)(L.Fragment,{children:[(0,L.jsx)(`div`,{className:`diff-hunk`,children:e.header}),e.lines.map((t,n)=>(0,L.jsxs)(`div`,{className:`diff-row diff-${t.kind}`,children:[(0,L.jsx)(`span`,{className:`diff-no`,children:t.oldNo??``}),(0,L.jsx)(`span`,{className:`diff-no`,children:t.newNo??``}),(0,L.jsx)(`span`,{className:`diff-mark`,children:t.kind===`add`?`+`:t.kind===`remove`?`\u2212`:``}),(0,L.jsx)(`span`,{className:`diff-text`,children:t.text})]},`${e.header}-${n}`))]})}function nm({file:e,side:t}){return(0,L.jsxs)(`div`,{className:`diff-patch`,children:[(0,L.jsx)(`div`,{className:`diff-file`,children:e.path}),e.meta.map((e,t)=>(0,L.jsx)(`div`,{className:`diff-meta`,children:e},`${e}-${t}`)),e.binary?(0,L.jsx)(`p`,{className:`diff-note-line`,children:`binary file changed`}):null,e.hunks.map(e=>(0,L.jsx)(tm,{hunk:e,side:t},e.header))]})}function rm({dir:e,commit:t,file:n}){let[r,i]=(0,_.useState)(null),[a,o]=(0,_.useState)(null),[s,c]=(0,_.useState)($p);(0,_.useEffect)(()=>{let r=!0;i(null),o(null);let a=fe();return a===null?(o("Diffs need the local server: open the map with `cogit open`."),()=>{r=!1}):(_e(e,t,n,a).then(e=>{r&&i(e)},e=>{r&&o(e instanceof Error?e.message:String(e))}),()=>{r=!1})},[e,t,n]);function l(e){c(e),em(e)}if(a!==null)return(0,L.jsx)(`p`,{className:`error diff-loading`,children:a});if(r===null)return(0,L.jsx)(`p`,{className:`muted diff-loading`,children:`Loading diff\u2026`});let u=Yp(r);return u.length===0?(0,L.jsx)(`p`,{className:`diff-loading`,children:r===``?`No changes in this commit.`:r}):(0,L.jsxs)(`div`,{className:`diff-view`,children:[(0,L.jsx)(`div`,{className:`diff-toolbar`,children:(0,L.jsxs)(`label`,{children:[(0,L.jsx)(`input`,{type:`checkbox`,checked:s,onChange:e=>l(e.target.checked)}),` `,`Side by side`]})}),u.map(e=>(0,L.jsx)(nm,{file:e,side:s},e.path))]})}function im(e){return`\'${e.replace(/\'/g,`\'\\\\\'\'`)}\'`}function am(e){return/^[A-Za-z0-9._:/-]+$/.test(e)?e:im(e)}function om(e,t,n=!1){let r=`cd ${im(e)} && claude --resume ${am(t)}`;return n?`${r} --fork-session`:r}var sm={resume:`Resume`,fork:`Fork`},cm={resume:`Copy the command that reopens this session where it left off`,fork:`Copy the command that continues this session as a new one; the original stays as it is`};function lm({projectPath:e,sessionId:t,available:n=!0}){let[r,i]=(0,_.useState)(`resume`),[a,o]=(0,_.useState)(`idle`);if(!n)return(0,L.jsxs)(`span`,{className:`resume-actions`,children:[(0,L.jsx)(`button`,{type:`button`,className:`resume-button`,disabled:!0,children:`Resume`}),(0,L.jsx)(`button`,{type:`button`,className:`resume-button`,disabled:!0,children:`Fork`}),(0,L.jsx)(`span`,{className:`muted resume-note`,children:`session no longer available`})]});let s=n=>{i(n),o(`idle`),Up(om(e,t,n===`fork`)).then(e=>o(e?`copied`:`failed`))};return(0,L.jsxs)(`span`,{className:`resume-actions`,children:[[`resume`,`fork`].map(n=>(0,L.jsx)(`button`,{type:`button`,className:`resume-button`,title:`${cm[n]}: ${om(e,t,n===`fork`)}`,onClick:()=>s(n),children:sm[n]},n)),a===`copied`?(0,L.jsxs)(`span`,{className:`muted resume-note`,children:[`Copied the `,r,` command.`]}):null,a===`failed`?(0,L.jsxs)(L.Fragment,{children:[(0,L.jsx)(`span`,{className:`muted resume-note`,children:`Copy failed \u2014 press Ctrl+C to copy.`}),(0,L.jsx)(`code`,{className:`resume-command`,ref:e=>{if(!e)return;let t=document.createRange();t.selectNodeContents(e);let n=window.getSelection();n?.removeAllRanges(),n?.addRange(t)},children:om(e,t,r===`fork`)})]}):null]})}function um(e,t){return t?e===void 0?`queued`:e.tools.length===0?`empty`:`ready`:`off`}function dm(e,t=3){let n=t=>e?.tools.find(e=>e.kind===t)?.text,r=n(`pseudo`)??n(`example`),i=n(`table`)??n(`interface`),a=(r===void 0?(i?.split(`\n`)??[]).map(e=>{let t=e.split(`|`).map(e=>e.trim());return t.length===3?`${t[0]}: ${t[1]} \u2192 ${t[2]}`:e.trim()}):r.split(`\n`).map(e=>e.trim())).filter(e=>e!==``).slice(0,t);return a.length===0?void 0:a.join(`\n`)}function fm(e){let t=[];for(let n of e.split(`\n`)){if(n.trim()===``)continue;let e=n.split(`|`).map(e=>e.trim());if(e.length!==3||e.some(e=>e===``))return;t.push(e)}return t}var pm=`/assets/mermaid.js`,mm;function hm(e=typeof window>`u`?`file:`:window.location.protocol){return e===`http:`||e===`https:`}function gm(){return mm??=new Promise((e,t)=>{let n=document.createElement(`script`);n.src=pm,n.onload=()=>{let n=window.mermaid;n===void 0?t(Error(`mermaid did not load`)):(n.initialize({startOnLoad:!1,securityLevel:`strict`,theme:`neutral`,fontFamily:`inherit`}),e(n))},n.onerror=()=>{mm=void 0,t(Error(`mermaid did not load`))},document.head.append(n)}),mm}var _m=0;function vm({source:e,className:t}){let n=(0,_.useRef)(null),r=hm(),[i,a]=(0,_.useState)(!1);(0,_.useEffect)(()=>{if(!r)return;let t=!1;a(!1);let i=`cogit-shape-${_m+=1}`;return gm().then(t=>t.render(i,e)).then(({svg:e})=>{!t&&n.current!==null&&(n.current.innerHTML=e)}).catch(()=>{t||a(!0)}),()=>{t=!0}},[e,r]);let o=t?` ${t}`:``;return r?i?(0,L.jsx)(`pre`,{className:`shape-source${o}`,children:e}):(0,L.jsx)(`div`,{ref:n,className:`shape-diagram${o}`}):(0,L.jsxs)(`div`,{className:`shape-offline${o}`,children:[(0,L.jsx)(`pre`,{className:`shape-source`,children:e}),(0,L.jsxs)(`p`,{className:`shape-note`,children:[`The diagram is drawn when the map is opened with `,(0,L.jsx)(`code`,{children:`cogit open`}),`.`]})]})}var ym=[{id:`intent`,number:`1`,label:`Intent`},{id:`shape`,number:`2`,label:`Shape`},{id:`code`,number:`3`,label:`Code`}],bm={user:`You`,agent:`The agent, on its own`,agreed:`You, approving the agent\'s proposal`};function xm({node:e}){return!e.why&&!e.alternatives?.length&&!e.agentDecisions?.length&&!e.work?.length&&!e.decidedBy?(0,L.jsx)(`p`,{className:`muted`,children:`No reason was recorded for this message.`}):(0,L.jsxs)(`div`,{className:`shape-intent`,children:[e.why?(0,L.jsxs)(`section`,{children:[(0,L.jsx)(`h4`,{children:`Why`}),(0,L.jsx)(`p`,{children:e.why})]}):null,e.alternatives?.length?(0,L.jsxs)(`section`,{children:[(0,L.jsx)(`h4`,{children:`Considered and rejected`}),(0,L.jsx)(`ul`,{children:e.alternatives.map(e=>(0,L.jsxs)(`li`,{children:[(0,L.jsx)(`strong`,{children:e.option}),e.why?(0,L.jsxs)(L.Fragment,{children:[` \u2014 `,e.why]}):null]},e.option))})]}):null,e.agentDecisions?.length?(0,L.jsxs)(`section`,{children:[(0,L.jsx)(`h4`,{children:`Decided by the agent on its own`}),(0,L.jsx)(`ul`,{children:e.agentDecisions.map(e=>(0,L.jsxs)(`li`,{children:[(0,L.jsx)(`strong`,{children:e.title}),e.why?(0,L.jsxs)(L.Fragment,{children:[` \u2014 `,e.why]}):null]},e.title))})]}):null,e.work?.length?(0,L.jsxs)(`section`,{children:[(0,L.jsx)(`h4`,{children:`What the agent did`}),(0,L.jsx)(`ul`,{children:e.work.map(e=>(0,L.jsx)(`li`,{children:e},e))})]}):null,e.decidedBy?(0,L.jsxs)(`p`,{className:`decided-by`,children:[`Decided by: `,bm[e.decidedBy]]}):null]})}var Sm={pseudo:`Steps`,example:`Example`,mermaid:`Flowchart source (not drawn)`,sequence:`Sequence source (not drawn)`,table:`Before / After (as written)`,interface:`Interface (as written)`},Cm=new Set([`mermaid`,`sequence`]),wm={table:[`Case`,`Before`,`After`],interface:[`Item`,`Before`,`After`]};function Tm({columns:e,rows:t}){return(0,L.jsxs)(`table`,{className:`shape-table`,children:[(0,L.jsx)(`thead`,{children:(0,L.jsx)(`tr`,{children:e.map(e=>(0,L.jsx)(`th`,{scope:`col`,children:e},e))})}),(0,L.jsx)(`tbody`,{children:t.map(([e,t,n],r)=>(0,L.jsxs)(`tr`,{children:[(0,L.jsx)(`th`,{scope:`row`,children:e}),(0,L.jsx)(`td`,{children:t}),(0,L.jsx)(`td`,{children:n})]},`${r}-${e}`))})]})}function Em({node:e,enabled:t,renderMermaid:n}){let r=um(e.shape,t);return r===`off`?(0,L.jsx)(`p`,{className:`muted`,children:`Shapes are off. Turn them on in Settings \u2192 Recording.`}):r===`queued`?(0,L.jsx)(`p`,{className:`muted`,children:`This Shape is being prepared, or the message landed no commits.`}):r===`empty`?(0,L.jsx)(`p`,{className:`muted`,children:`Nothing to show: the change was too small to draw.`}):(0,L.jsxs)(`div`,{className:`shape-tools`,children:[e.shape?.tools.map((e,t)=>{let r=`${e.kind}-${t}`;if(Cm.has(e.kind)&&e.valid!==!1)return(0,L.jsxs)(`figure`,{className:`shape-figure`,children:[n(e.text),(0,L.jsx)(`figcaption`,{children:e.kind===`sequence`?`Sequence`:`Flowchart`})]},r);let i=wm[e.kind],a=i&&e.valid!==!1?fm(e.text):void 0;return i&&a!==void 0?(0,L.jsxs)(`figure`,{className:`shape-figure`,children:[(0,L.jsx)(Tm,{columns:i,rows:a}),(0,L.jsx)(`figcaption`,{children:e.kind===`interface`?`Interface`:`Before / After`})]},r):(0,L.jsxs)(`figure`,{className:`shape-figure`,children:[(0,L.jsx)(`pre`,{className:`shape-source is-${e.kind}`,children:e.text}),(0,L.jsx)(`figcaption`,{children:Sm[e.kind]??e.kind})]},r)}),e.shape?.by?(0,L.jsxs)(`p`,{className:`shape-by`,children:[`Written by `,e.shape.by===`side`?`the side model`:`the agent`,`.`]}):null]})}function Dm({node:e,root:t}){let n=typeof document<`u`&&de(),r=e.commits??[];return r.length===0?(0,L.jsx)(`p`,{className:`muted`,children:`No commit is linked to this message.`}):(0,L.jsxs)(`div`,{className:`shape-code`,children:[r.map(r=>(0,L.jsxs)(`section`,{children:[(0,L.jsxs)(`h4`,{children:[(0,L.jsx)(`code`,{children:r.slice(0,7)}),` `,e.commitTags?.find(e=>e.hash===r)?.subject??``]}),n?(0,L.jsx)(rm,{dir:t,commit:r}):null]},r)),n?null:(0,L.jsx)(`p`,{className:`muted`,children:"Open with `cogit open` to see the diffs."})]})}function Om({node:e,root:t,tab:n,enabled:r,onTab:i,renderMermaid:a=e=>(0,L.jsx)(vm,{source:e})}){return(0,L.jsxs)(`div`,{className:`shape-layers`,children:[(0,L.jsx)(`div`,{className:`shape-tabs`,role:`tablist`,"aria-label":`Intent, Shape and Code`,children:ym.map(e=>(0,L.jsxs)(`button`,{type:`button`,role:`tab`,"aria-selected":n===e.id,className:n===e.id?`shape-tab is-active`:`shape-tab`,onClick:()=>i(e.id),children:[(0,L.jsx)(`span`,{className:`shape-tab-no`,children:e.number}),` `,e.label]},e.id))}),(0,L.jsxs)(`div`,{className:`shape-layer`,role:`tabpanel`,"aria-label":ym.find(e=>e.id===n)?.label,children:[n===`intent`?(0,L.jsx)(xm,{node:e}):null,n===`shape`?(0,L.jsx)(Em,{node:e,enabled:r,renderMermaid:a}):null,n===`code`?(0,L.jsx)(Dm,{node:e,root:t}):null]})]})}function km({node:e,root:t,enabled:n,onClose:r}){let[i,a]=(0,_.useState)(`shape`),o=(0,_.useRef)(null);return(0,_.useEffect)(()=>{o.current?.focus();let e=e=>{e.key===`Escape`?(e.stopPropagation(),r()):e.key===`1`?a(`intent`):e.key===`2`?a(`shape`):e.key===`3`&&a(`code`)};return window.addEventListener(`keydown`,e),()=>window.removeEventListener(`keydown`,e)},[r]),(0,L.jsx)(`div`,{className:`shape-overlay`,onClick:r,children:(0,L.jsxs)(`div`,{ref:o,className:`shape-modal`,role:`dialog`,"aria-modal":`true`,"aria-label":`${e.title} \u2014 Intent, Shape and Code`,tabIndex:-1,onClick:e=>e.stopPropagation(),children:[(0,L.jsxs)(`header`,{className:`shape-head`,children:[(0,L.jsxs)(`div`,{children:[(0,L.jsx)(`span`,{className:`kind`,children:`message`}),(0,L.jsx)(`h2`,{children:e.title})]}),(0,L.jsx)(`button`,{type:`button`,className:`drilldown-close`,"aria-label":`Close`,onClick:r,children:`\xD7`})]}),(0,L.jsx)(Om,{node:e,root:t,tab:i,enabled:n,onTab:a})]})})}function Am({node:e,root:t,enabled:n}){let[r,i]=(0,_.useState)(!1),a=um(e.shape,n),o=dm(e.shape),s=e.shape?.tools.find(e=>Cm.has(e.kind)&&e.valid!==!1);return(0,L.jsxs)(`section`,{className:`shape-section`,children:[(0,L.jsx)(`h3`,{children:`Intent, Shape and Code`}),a===`ready`?o?(0,L.jsx)(`pre`,{className:`shape-preview`,children:o}):s?(0,L.jsx)(vm,{source:s.text,className:`shape-preview-diagram`}):null:a===`off`?(0,L.jsx)(`p`,{className:`muted`,children:`Shapes are off.`}):a===`empty`?(0,L.jsx)(`p`,{className:`muted`,children:`Nothing to show for this change.`}):(0,L.jsx)(`p`,{className:`muted`,children:`Shape is being prepared.`}),(0,L.jsx)(`button`,{type:`button`,className:`shape-open`,onClick:()=>i(!0),children:`Open`}),r?(0,L.jsx)(km,{node:e,root:t,enabled:n,onClose:()=>i(!1)}):null]})}function jm(e,t){return e.sessions.find(e=>e.sessionId===t)}function Mm(e,t){return e.messages.find(e=>e.id===t)}function Nm({value:e}){let[t,n]=(0,_.useState)(`idle`),r=(0,_.useRef)(null),i=`Ask your agent: cogit show ${e}`;return(0,L.jsxs)(`div`,{className:`message-hash`,title:i,children:[(0,L.jsx)(`code`,{ref:r,children:$(e)}),(0,L.jsx)(`button`,{type:`button`,onClick:()=>{n(`idle`),Up(e).then(e=>{if(e){n(`copied`);return}let t=r.current;if(t){let e=document.createRange();e.selectNodeContents(t);let n=window.getSelection();n?.removeAllRanges(),n?.addRange(e)}n(`failed`)})},children:`Copy hash`}),t===`copied`?(0,L.jsx)(`span`,{className:`muted`,children:`Copied.`}):null,t===`failed`?(0,L.jsx)(`span`,{className:`muted`,children:`Copy failed \u2014 press Ctrl+C to copy.`}):null]})}function Pm({model:e,session:t}){return(0,L.jsx)(`div`,{className:`resume`,children:(0,L.jsx)(lm,{projectPath:e.project.path,sessionId:t.sessionId,available:t.transcriptAvailable})})}function Fm({label:e,children:t}){return(0,L.jsxs)(`div`,{className:`drilldown-field`,children:[(0,L.jsx)(`dt`,{children:e}),(0,L.jsx)(`dd`,{children:t})]})}function Im({session:e}){let{worktree:t}=e;return t?(0,L.jsxs)(Fm,{label:`Worktree`,children:[t.branch??`detached HEAD`,` `,(0,L.jsx)(`code`,{children:t.path})]}):null}function Lm({model:e,session:t}){return(0,L.jsxs)(L.Fragment,{children:[(0,L.jsxs)(`dl`,{className:`drilldown-meta`,children:[(0,L.jsx)(Fm,{label:`Agent`,children:t.agent}),t.author?(0,L.jsxs)(Fm,{label:`Recorded by`,children:[t.author,Np(e).mine(t)?` (you)`:``]}):null,(0,L.jsx)(Fm,{label:`Session`,children:(0,L.jsx)(`code`,{children:t.sessionId})}),(0,L.jsx)(Fm,{label:`Started`,children:Uf(t.startedAt)}),(0,L.jsx)(Fm,{label:`Updated`,children:Uf(t.updatedAt)}),(0,L.jsx)(Im,{session:t}),t.unrecordedMessages?(0,L.jsxs)(Fm,{label:`Not recorded`,children:[t.unrecordedMessages,` message`,t.unrecordedMessages===1?``:`s`,` not recorded (the side model at session end is off)`]}):null]}),(0,L.jsx)(Pm,{model:e,session:t})]})}var Rm={user:`You`,agent:`The agent, on its own`,agreed:`You, approving the agent\'s proposal`},zm=1200;function Bm({text:e}){let[t,n]=(0,_.useState)(!1);return e.length<=zm||t?(0,L.jsx)(`p`,{className:`chat-text`,children:e}):(0,L.jsxs)(L.Fragment,{children:[(0,L.jsxs)(`p`,{className:`chat-text`,children:[e.slice(0,zm),`\u2026`]}),(0,L.jsxs)(`button`,{type:`button`,className:`chat-more`,onClick:()=>n(!0),children:[`Show all (`,e.length.toLocaleString(),` characters)`]})]})}function Vm(e){let t=[];e.commands>0&&t.push(`ran ${e.commands} command${e.commands===1?``:`s`}`);let n=e.files.length;return n>0&&t.push(`edited ${n} file${n===1?``:`s`}`),e.other>0&&t.push(`${e.other} other tool call${e.other===1?``:`s`}`),t.join(`, `)}function Hm({session:e,id:t}){if(!e)return null;let n=e.chat?.find(e=>e.id===t),r;if(n){let e=Vm(n.tools);r=(0,L.jsxs)(L.Fragment,{children:[(0,L.jsxs)(`div`,{className:`chat-entry chat-user`,children:[(0,L.jsxs)(`div`,{className:`chat-who`,children:[`You \xB7 `,Uf(n.at)]}),(0,L.jsx)(Bm,{text:n.text})]}),(0,L.jsxs)(`div`,{className:`chat-entry chat-agent`,children:[(0,L.jsx)(`div`,{className:`chat-who`,children:`Agent`}),n.replies.length===0?(0,L.jsx)(`p`,{className:`muted`,children:`No written reply.`}):n.replies.map((e,t)=>(0,L.jsx)(Bm,{text:e},`${n.id}-${t}`)),e?(0,L.jsx)(`p`,{className:`chat-tools`,title:n.tools.files.join(`\n`),children:e}):null]})]})}else r=e.transcriptAvailable?(0,L.jsx)(`p`,{className:`muted`,children:`This message was not found in the transcript.`}):(0,L.jsx)(`p`,{className:`muted`,children:`This conversation is not on this machine. The summary above is what remains.`});return(0,L.jsxs)(`details`,{className:`chat fold`,children:[(0,L.jsx)(`summary`,{children:`Conversation`}),r]})}function Um(e,t){return bp(e.messages).segments.find(e=>e.ids.includes(t))?.id}function Wm({session:e,branchId:t}){if(!t)return null;let n=bp(e.messages).segments.find(e=>e.id===t);if(!n)return null;let{branch:r}=n,i=r.firstAt&&r.lastAt&&r.firstAt!==r.lastAt?` \xB7 ${Uf(r.firstAt)} \u2192 ${Uf(r.lastAt)}`:``;return(0,L.jsxs)(`details`,{className:`branch-detail fold`,children:[(0,L.jsxs)(`summary`,{children:[`Branch \xB7 `,(0,L.jsx)(`span`,{style:{color:`var(--l${n.colorIndex})`},children:r.title})]}),(0,L.jsxs)(`p`,{className:`branch-range`,children:[r.count>1?`${r.fromLabel}\u2013${r.toLabel}`:r.fromLabel,` \xB7`,` `,r.count,` message`,r.count===1?``:`s`,i]}),r.asked?(0,L.jsxs)(`p`,{children:[(0,L.jsx)(`b`,{children:`Asked:`}),` `,r.asked]}):null,r.outcome?(0,L.jsxs)(`p`,{children:[(0,L.jsx)(`b`,{children:`Outcome:`}),` `,r.outcome]}):null,r.open?(0,L.jsxs)(`p`,{children:[(0,L.jsx)(`b`,{children:`Open:`}),` `,r.open]}):null]})}function Gm({session:e,node:t,onNavigate:n}){if(!e||!n||t.kind!==`message`)return null;let{previous:r,next:i}=np(e.messages,t.nodeId),a=t=>t?()=>n({sessionId:e.sessionId,focusId:tp($f(e.sessionId),t.id),selection:{type:`node`,sessionId:e.sessionId,nodeId:t.id}}):void 0;return(0,L.jsxs)(`nav`,{className:`message-nav`,"aria-label":`Messages`,children:[(0,L.jsx)(`button`,{type:`button`,disabled:!r,onClick:a(r),title:r?.title,children:`\u2190 Previous message`}),(0,L.jsx)(`button`,{type:`button`,disabled:!i,onClick:a(i),title:i?.title,children:`Next message \u2192`})]})}function Km({model:e,node:t,onNavigate:n,read:r,onToggleRead:i,bigChangeLines:a,readError:o}){let s=jm(e,t.sessionId),c=typeof document<`u`&&de()&&fe()!==null;return(0,L.jsxs)(L.Fragment,{children:[(0,L.jsx)(Gm,{session:s,node:t,onNavigate:n}),t.kind===`message`&&ep(t.nodeId)?(0,L.jsx)(Nm,{value:t.nodeId}):null,t.summary?(0,L.jsxs)(`section`,{children:[(0,L.jsx)(`h3`,{children:`Summary`}),(0,L.jsx)(`p`,{children:t.summary})]}):null,t.why?(0,L.jsxs)(`section`,{children:[(0,L.jsx)(`h3`,{children:`Why`}),(0,L.jsx)(`p`,{children:t.why})]}):null,t.alternatives?.length?(0,L.jsxs)(`section`,{children:[(0,L.jsx)(`h3`,{children:`Considered and rejected`}),(0,L.jsx)(`ul`,{className:`drilldown-list`,children:t.alternatives.map(e=>(0,L.jsxs)(`li`,{children:[(0,L.jsx)(`strong`,{children:e.option}),e.why?(0,L.jsxs)(L.Fragment,{children:[` \u2014 `,e.why]}):null]},e.option))})]}):null,t.decidedBy?(0,L.jsxs)(`p`,{className:`decided-by`,children:[`Decided by: `,Rm[t.decidedBy]]}):null,t.agentDecisions?.length?(0,L.jsxs)(`section`,{children:[(0,L.jsx)(`h3`,{children:`Decided by the agent on its own`}),(0,L.jsx)(`ul`,{className:`drilldown-list`,children:t.agentDecisions.map(e=>(0,L.jsxs)(`li`,{children:[(0,L.jsx)(`strong`,{children:e.title}),e.why?(0,L.jsxs)(L.Fragment,{children:[` \u2014 `,e.why]}):null,e.alternatives?.length?(0,L.jsx)(`ul`,{children:e.alternatives.map(e=>(0,L.jsxs)(`li`,{children:[`Not: `,e.option,e.why?(0,L.jsxs)(L.Fragment,{children:[` \u2014 `,e.why]}):null]},e.option))}):null]},e.title))})]}):null,t.work?.length?(0,L.jsxs)(`section`,{children:[(0,L.jsx)(`h3`,{children:`What the agent did`}),(0,L.jsx)(`ul`,{className:`drilldown-list`,children:t.work.map(e=>(0,L.jsx)(`li`,{children:e},e))})]}):null,t.kind===`message`&&t.commits?.length?(0,L.jsx)(Am,{node:t,root:e.project.path,enabled:e.settings?.shapes??!0}):null,t.kind===`message`&&t.change?(0,L.jsxs)(`section`,{children:[(0,L.jsx)(`h3`,{children:`Code landed`}),(0,L.jsxs)(`p`,{children:[(0,L.jsx)(`span`,{className:`git-change${!r&&Rf(t.change,a)?` is-big`:``}`,children:Q(t.change)}),` `,`after this message.`]}),(0,L.jsx)(`button`,{type:`button`,className:`read-toggle`,"aria-pressed":r,disabled:i===void 0,onClick:()=>i?.(t.nodeId,!r),children:r?`Mark as unread`:`Mark as read`}),typeof document<`u`&&de()?null:(0,L.jsx)(`p`,{className:`muted`,children:"Saved under .cogit/state by `cogit open`; this page keeps it only while open."}),o===null?null:(0,L.jsx)(`p`,{className:`error`,children:o})]}):null,t.commits?.length?(0,L.jsxs)(`section`,{children:[(0,L.jsxs)(`h3`,{children:[`Commits `,(0,L.jsx)(`span`,{className:`count`,children:t.commits.length})]}),(0,L.jsx)(`ul`,{className:`commit-list`,children:t.commits.map(n=>{let r=t.commitTags?.find(e=>e.hash===n),i=t.commitTags!==void 0&&r?.subject===void 0;return(0,L.jsx)(qm,{hash:n,subject:r?.subject,missing:i,root:e.project.path,expandable:c&&!i},n)})})]}):null,t.files?.length?(0,L.jsxs)(`section`,{children:[(0,L.jsxs)(`h3`,{children:[`Changed files `,(0,L.jsx)(`span`,{className:`count`,children:t.files.length})]}),(0,L.jsx)(`ul`,{className:`file-list`,children:t.files.map(n=>{let r=[...t.commitTags??[]].reverse().find(e=>e.files?.includes(n));return(0,L.jsx)(Jm,{file:n,root:e.project.path,commit:r?.hash,expandable:c&&r!==void 0},n)})})]}):null,!c&&(t.commits?.length||t.files?.length)?(0,L.jsx)(`p`,{className:`muted`,children:"Open with `cogit open` to see diffs."}):null,t.kind===`message`?(0,L.jsx)(Hm,{session:s,id:t.nodeId}):null,s?(0,L.jsx)(Wm,{session:s,branchId:Um(s,t.nodeId)}):null,(0,L.jsxs)(`dl`,{className:`drilldown-meta`,children:[(0,L.jsx)(Fm,{label:t.kind===`message`?`Sent`:`Recorded`,children:Uf(t.at??t.addedAt??null)}),t.touchedAt&&t.touchedAt!==t.addedAt?(0,L.jsx)(Fm,{label:`Last changed`,children:Uf(t.touchedAt)}):null,(0,L.jsx)(Fm,{label:`Session`,children:s?(0,L.jsxs)(L.Fragment,{children:[s.title||s.sessionId,` `,(0,L.jsx)(`code`,{children:s.sessionId})]}):(0,L.jsx)(`code`,{children:t.sessionId})}),s?(0,L.jsxs)(L.Fragment,{children:[(0,L.jsx)(Fm,{label:`Session started`,children:Uf(s.startedAt)}),(0,L.jsx)(Fm,{label:`Session updated`,children:Uf(s.updatedAt)}),(0,L.jsx)(Im,{session:s})]}):null]}),s?(0,L.jsx)(Pm,{model:e,session:s}):null]})}function qm({hash:e,subject:t,missing:n,root:r,expandable:i}){let[a,o]=(0,_.useState)(!1),s=t===void 0?void 0:Gp(t),c=s?.type===void 0?void 0:qp(s.type),l=(0,L.jsxs)(L.Fragment,{children:[(0,L.jsx)(`code`,{className:`commit-hash`,children:e.slice(0,7)}),s?.type?(0,L.jsxs)(`span`,{className:`commit-type`,style:c===void 0?void 0:{background:`var(--l${c})`},children:[s.type,s.breaking?`!`:``]}):null,s?.scope?(0,L.jsx)(`span`,{className:`commit-scope`,children:s.scope}):null,(0,L.jsx)(`span`,{className:`commit-subject`,children:s?s.text:`not in this repository`}),i?(0,L.jsx)(`span`,{className:`diff-caret`,children:a?`\u2212`:`+`}):null]});return(0,L.jsxs)(`li`,{className:n?`commit-item is-missing`:`commit-item`,title:e,children:[i?(0,L.jsx)(`button`,{type:`button`,className:`commit-row`,"aria-expanded":a,onClick:()=>o(e=>!e),children:l}):(0,L.jsx)(`div`,{className:`commit-row`,children:l}),a?(0,L.jsx)(rm,{dir:r,commit:e}):null]})}function Jm({file:e,root:t,commit:n,expandable:r}){let[i,a]=(0,_.useState)(!1),{dir:o,name:s}=Jp(e),c=(0,L.jsxs)(L.Fragment,{children:[(0,L.jsx)(`span`,{className:`file-name`,children:s}),o?(0,L.jsx)(`span`,{className:`file-dir`,children:o}):null,r?(0,L.jsx)(`span`,{className:`diff-caret`,children:i?`\u2212`:`+`}):null]});return(0,L.jsxs)(`li`,{title:e,children:[r&&n!==void 0?(0,L.jsx)(`button`,{type:`button`,className:`file-row`,"aria-expanded":i,onClick:()=>a(e=>!e),children:c}):(0,L.jsx)(`div`,{className:`file-row`,children:c}),i&&n!==void 0?(0,L.jsx)(rm,{dir:t,commit:n,file:e}):null]})}function Ym({model:e,session:t}){let{done:n,pending:r}=t.status;return(0,L.jsxs)(L.Fragment,{children:[(0,L.jsxs)(`section`,{children:[(0,L.jsx)(`h3`,{children:`Goal`}),(0,L.jsx)(`p`,{children:t.status.goal||`No goal recorded.`})]}),(0,L.jsxs)(`section`,{children:[(0,L.jsx)(`h3`,{children:`Done`}),n.length>0?(0,L.jsx)(`ul`,{className:`drilldown-list`,children:n.map((e,t)=>(0,L.jsx)(`li`,{children:e},`${t}-${e}`))}):(0,L.jsx)(`p`,{className:`muted`,children:`Nothing yet.`})]}),(0,L.jsxs)(`section`,{children:[(0,L.jsx)(`h3`,{children:`Pending`}),r.length>0?(0,L.jsx)(`ul`,{className:`drilldown-list`,children:r.map((e,t)=>(0,L.jsxs)(`li`,{className:e.needsUser?`needs-user`:void 0,children:[e.text,e.needsUser?(0,L.jsx)(`span`,{className:`badge`,children:`needs you`}):null]},`${t}-${e.text}`))}):(0,L.jsx)(`p`,{className:`muted`,children:`Nothing pending.`})]}),(0,L.jsxs)(`section`,{children:[(0,L.jsx)(`h3`,{children:`Next`}),(0,L.jsx)(`p`,{children:t.status.next||`No next step recorded.`})]}),(0,L.jsx)(Lm,{model:e,session:t})]})}function Xm({model:e,selection:t,onClose:n,onNavigate:r,read:i=!1,onToggleRead:a,bigChangeLines:o=300,readError:s=null}){if((0,_.useEffect)(()=>{if(!t)return;let e=e=>{if(e.key===`Escape`){if(document.querySelector(`.shape-overlay`)!==null)return;n()}};return window.addEventListener(`keydown`,e),()=>window.removeEventListener(`keydown`,e)},[t,n]),!t)return null;if(t.type===`session`){let r=jm(e,t.sessionId);return r?(0,L.jsxs)(`aside`,{className:`drilldown`,role:`dialog`,"aria-label":`Session details`,children:[(0,L.jsxs)(`header`,{className:`drilldown-head`,children:[(0,L.jsxs)(`div`,{children:[(0,L.jsx)(`span`,{className:`kind`,children:`session`}),(0,L.jsx)(`h2`,{children:r.title||r.sessionId})]}),(0,L.jsx)(`button`,{type:`button`,className:`drilldown-close`,"aria-label":`Close`,onClick:n,children:`\xD7`})]}),(0,L.jsx)(`div`,{className:`drilldown-body`,children:(0,L.jsx)(Ym,{model:e,session:r})})]}):null}let c=jm(e,t.sessionId),l=c?Mm(c,t.nodeId):void 0;if(!c||!l)return null;let u=Yf(l,c.sessionId);return(0,L.jsxs)(`aside`,{className:`drilldown`,role:`dialog`,"aria-label":`Message details`,children:[(0,L.jsxs)(`header`,{className:`drilldown-head`,children:[(0,L.jsxs)(`div`,{children:[(0,L.jsx)(`span`,{className:`kind kind-${u.kind}`,children:Jf(u.kind)}),(0,L.jsx)(`h2`,{children:u.title})]}),(0,L.jsx)(`button`,{type:`button`,className:`drilldown-close`,"aria-label":`Close`,onClick:n,children:`\xD7`})]}),(0,L.jsx)(`div`,{className:`drilldown-body`,children:(0,L.jsx)(Km,{model:e,node:u,onNavigate:r,read:i,onToggleRead:a,bigChangeLines:o,readError:s})})]})}var Zm=`.react-flow, .settings-overlay, .switcher-overlay, .drilldown, .outline, .files-view`,Qm=`.react-flow__renderer`;function $m(e){let t=e;return t===null||typeof t.closest!=`function`||t.closest(Zm)===null}function eh(e,t){e.preventDefault(),t.dispatchEvent(new WheelEvent(`wheel`,{bubbles:!0,cancelable:!0,composed:!0,deltaX:e.deltaX,deltaY:e.deltaY,deltaMode:e.deltaMode,ctrlKey:e.ctrlKey,shiftKey:e.shiftKey,altKey:e.altKey,metaKey:e.metaKey,clientX:e.clientX,clientY:e.clientY}))}function th(e){if(!$m(e.target))return;let t=document.querySelector(Qm);t&&eh(e,t)}function nh(){(0,_.useEffect)(()=>(window.addEventListener(`wheel`,th,{passive:!1}),()=>window.removeEventListener(`wheel`,th)),[])}function rh(e,t){let n=new Set(t),r=new Set(e.open),i=new Set;for(let t of e.bySearch)n.has(t)?i.add(t):r.delete(t);for(let e of n)r.has(e)||(r.add(e),i.add(e));return{open:r,bySearch:i}}function ih(e){return[...e.open].filter(t=>!e.bySearch.has(t))}function ah(e){if(!e)return-1/0;let t=Date.parse(e);return Number.isNaN(t)?-1/0:t}function oh(e){let t,n=-1/0;for(let r of e.messages){if(r.at===void 0)continue;let e=ah(r.at);e>n&&(n=e,t=r.at)}return t??e.updatedAt}function sh(e,t){let n=e.messages[0]?.continues?.sessionId;return n===void 0||n===e.sessionId?null:t.has(n)?n:null}function ch(e){return e.sessions.sort((e,t)=>ah(e.startedAt)-ah(t.startedAt)||e.sessionId.localeCompare(t.sessionId))}function lh(e,t){let n=ch(e),r=new Map(n.map(e=>[e.sessionId,e])),i=new Set(r.keys()),a=new Map,o=n.map(e=>{let t=sh(e,i);return a.set(e.sessionId,t),{id:e.sessionId,title:e.title||e.sessionId,at:e.startedAt,until:oh(e),parent:t}}),s=n.map(e=>ah(e.startedAt));return{git:bp(o,{fold:!1,rowWidth:720,headId:Qf(e)?.sessionId??null,itemEnd:e=>{let t=ah(e.until);if(t===-1/0)return null;let n=0;for(let e=0;e<s.length;e+=1)(s[e]??-1/0)<=t&&(n=e+1);return n},...t===void 0?{}:{spaceAfter:t}}),sessions:r,parents:a}}function uh(e,t,n){let r=new Set(ch(e).map(e=>e.sessionId)),i=new Set;if(Array.isArray(t))for(let e of t)typeof e==`string`&&r.has(e)&&i.add(e);return n!==null&&i.add(n.sessionId),i}var dh=`cogit-theme`,fh=[`system`,`light`,`dark`];function ph(e){return fh[(fh.indexOf(e)+1)%fh.length]}function mh(e){return e===`system`?`same as your system`:e===`light`?`light`:`dark`}function hh(e){try{let t=e?.getItem(dh);return t===`light`||t===`dark`?t:`system`}catch{return`system`}}function gh(e,t){try{t===`system`?e?.removeItem(dh):e?.setItem(dh,t)}catch{}}function _h(e,t){t===`system`?delete e.dataset.theme:e.dataset.theme=t}function vh(){try{return typeof window>`u`?void 0:window.localStorage}catch{return}}var yh=hh(vh()),bh=new Set;function xh(){return yh}function Sh(e){yh=e,gh(vh(),e),typeof document<`u`&&_h(document.documentElement,e);for(let e of bh)e()}function Ch(e){return bh.add(e),()=>bh.delete(e)}function wh(){typeof document<`u`&&_h(document.documentElement,yh)}function Th(){return(0,_.useSyncExternalStore)(Ch,xh,xh)}var Eh={width:20,height:20,viewBox:`0 0 24 24`,fill:`none`,stroke:`currentColor`,strokeWidth:2,strokeLinecap:`round`,strokeLinejoin:`round`,"aria-hidden":!0};function Dh({mode:e}){return e===`light`?(0,L.jsxs)(`svg`,{...Eh,children:[(0,L.jsx)(`circle`,{cx:`12`,cy:`12`,r:`4`}),(0,L.jsx)(`path`,{d:`M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4`})]}):e===`dark`?(0,L.jsx)(`svg`,{...Eh,children:(0,L.jsx)(`path`,{d:`M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z`})}):(0,L.jsxs)(`svg`,{...Eh,children:[(0,L.jsx)(`rect`,{x:`3`,y:`4`,width:`18`,height:`12`,rx:`2`}),(0,L.jsx)(`path`,{d:`M8 20h8M12 16v4`})]})}function Oh(){let e=Th(),t=ph(e),n=`Theme: ${mh(e)}. Click for ${mh(t)}.`;return(0,L.jsx)(`button`,{type:`button`,className:`theme-button`,title:n,"aria-label":n,onClick:()=>Sh(t),children:(0,L.jsx)(Dh,{mode:e})})}function kh({messages:e,bigChangeLines:t,active:n,onSelect:r,onClose:i}){return(0,L.jsxs)(`nav`,{className:`outline unread-view`,"aria-label":`Unread messages, most code first`,children:[(0,L.jsxs)(`header`,{className:`outline-head`,children:[(0,L.jsx)(`span`,{className:`outline-title`,children:`Unread, most code first`}),(0,L.jsx)(`span`,{className:`outline-badge`,children:e.length}),(0,L.jsx)(`button`,{type:`button`,className:`drilldown-close`,"aria-label":`Hide unread`,onClick:i,children:`\xD7`})]}),(0,L.jsx)(`div`,{className:`outline-scroll`,children:e.length===0?(0,L.jsx)(`p`,{className:`empty`,children:`No unread messages with commits. A message appears here once a commit carries it and you have not marked it read.`}):(0,L.jsx)(`ul`,{className:`outline-list`,children:e.map(e=>{let i=Rf(e.change,t),a=n?.sessionId===e.sessionId&&n.messageId===e.messageId;return(0,L.jsx)(`li`,{children:(0,L.jsxs)(`button`,{type:`button`,className:`outline-item unread-row${a?` is-active`:``}${i?` is-big`:``}`,title:`${e.title} \u2014 ${e.sessionTitle}`,onClick:()=>r({sessionId:e.sessionId,messageId:e.messageId}),children:[(0,L.jsx)(`span`,{className:`git-change`,children:Q(e.change)}),(0,L.jsx)(`span`,{className:`unread-label`,children:e.label}),(0,L.jsx)(`span`,{className:`unread-title`,children:e.title}),(0,L.jsx)(`span`,{className:`muted unread-session`,children:e.sessionTitle}),(0,L.jsx)(`span`,{className:`muted unread-when`,children:e.at===void 0?``:Gf(e.at)})]})},e.messageId)})})})]})}var Ah=6,jh=20,Mh=36,Nh=(0,_.createContext)({selection:null,openIds:new Set,readIds:new Set,bigChangeLines:300,openSession:()=>{},openNode:()=>{},openContinue:()=>{},unfold:()=>{},resizeRows:()=>{},storeRowWidth:()=>{},person:null,people:Np({sessions:[]})});function Ph({session:e,git:t,highlights:n,activeHitId:r}){let{selection:i,readIds:a,bigChangeLines:o,openNode:s,unfold:c,resizeRows:l,storeRowWidth:u,person:d,people:f}=(0,_.useContext)(Nh),p=i?.sessionId===e.sessionId;if(t.rows.length===0)return(0,L.jsx)(`p`,{className:`graph-status empty`,children:`No messages recorded in this session yet.`});let m=!f.matches(e,d);return(0,L.jsxs)(`div`,{className:m?`session-rows is-dimmed`:`session-rows`,children:[(0,L.jsx)(Tp,{git:t,selectedId:i?.type===`node`&&p?i.nodeId:null,highlightIds:n,activeHitId:r,readIds:a,bigChangeLines:o,onSelect:t=>s(e.sessionId,t.message.id),onUnfold:c}),(0,L.jsx)(zp,{git:t,onResize:t=>l(e.sessionId,t),onDone:t=>u(e.sessionId,t)})]})}function Fh({data:e}){let{openSession:t,openContinue:n,selection:r,openIds:i,person:a}=(0,_.useContext)(Nh);return(0,L.jsxs)(`div`,{className:`map-node`,children:[(0,L.jsx)(Hp,{model:e.model,graph:e.graph,selectedSessionId:r?.type===`session`?r.sessionId:null,openIds:i,highlightSessionIds:e.sessionHits,person:a,onOpen:t,onContinue:n}),e.openings.map(t=>{let n=e.activeHit;return(0,L.jsx)(`div`,{className:`session-open`,style:{top:t.top,left:t.left},children:(0,L.jsx)(Ph,{session:t.session,git:t.git,highlights:e.highlights.get(t.session.sessionId),activeHitId:n?.sessionId===t.session.sessionId?n.messageId:null})},t.session.sessionId)})]})}var Ih={project:Fh};function Lh(e,t){let n=Qf(e);if(n===null)return null;let r=n.messageId===null?{sessionId:n.sessionId}:{sessionId:n.sessionId,messageId:n.messageId};return t?{...r,quiet:t}:r}function Rh(e){if(typeof window>`u`)return null;let t=new URLSearchParams(window.location.hash.replace(/^#/,``));if(!t.has(`focus`)&&!t.has(`s`))return Lh(e,!0);if(t.get(`focus`)===`head`){let t=Qf(e);return t===null?null:t.messageId===null?{sessionId:t.sessionId}:{sessionId:t.sessionId,messageId:t.messageId}}let n=t.get(`s`);if(n===null||n===``)return null;let r=Bh(e,n);if(r===void 0)return null;let i=t.get(`m`);return i!==null&&r.messages.some(e=>e.id===i)?{sessionId:n,messageId:i}:{sessionId:n}}function zh(e,t){return e.size===t.size&&[...e].every(e=>t.has(e))}function Bh(e,t){return e.sessions.find(e=>e.sessionId===t)}function Vh({model:e,search:t}){nh();let[n]=(0,_.useState)(()=>Rh(e));(0,_.useEffect)(()=>{n?.messageId!==void 0&&document.querySelector(`.lineage-map`)?.scrollIntoView({block:`start`})},[n]);let[r,i]=(0,_.useState)(()=>uh(e,e.openSessions,n)),[a,o]=(0,_.useState)(()=>new Set),s=(0,_.useCallback)(e=>{o(t=>{if(!t.has(e))return t;let n=new Set(t);return n.delete(e),n})},[]),[c,l]=(0,_.useState)(()=>n===null||n.quiet?null:n.messageId===void 0?{type:`session`,sessionId:n.sessionId}:{type:`node`,sessionId:n.sessionId,nodeId:n.messageId}),[u,d]=(0,_.useState)(()=>new Set),[f,p]=(0,_.useState)(()=>Lp(e.rowWidths)),[m,h]=(0,_.useState)(0),g=(0,_.useRef)(!1);(0,_.useEffect)(()=>{let t=fe();t!==null&&he(e.project.path,t).then(t=>{p(Lp(t.rowWidths));let r=uh(e,t.open,n);i(e=>zh(e,r)?e:(h(e=>e+1),r))}).catch(()=>{}).finally(()=>{g.current=!0})},[]),(0,_.useEffect)(()=>{let t=fe();if(t===null||!g.current)return;let n=window.setTimeout(()=>{let n=ih({open:r,bySearch:a});F(e.project.path,n,t).catch(e=>{console.warn(`cogit: could not save the open sessions`,e)})},300);return()=>window.clearTimeout(n)},[r,a,e.project.path]);let v=(0,_.useCallback)((e,t)=>{p(n=>{let{[e]:r,...i}=n;return t===520?i:{...i,[e]:t}})},[]),y=(0,_.useCallback)((t,n)=>{let r=fe();r!==null&&I(e.project.path,t,n===520?null:n,r).catch(e=>{console.warn(`cogit: could not save the row width`,e)})},[e.project.path]),[b,x]=(0,_.useState)(!1),[S,C]=(0,_.useState)(!0),[w,T]=(0,_.useState)(!1),[E,D]=(0,_.useState)(!1),[O,k]=(0,_.useState)(null),A=(0,_.useMemo)(()=>Np(e),[e]),j=(0,_.useMemo)(()=>A.options(),[A]),{expanded:ee,toggle:te}=ap(),[M,N]=(0,_.useState)(()=>new Set(e.read??[])),[ne,re]=(0,_.useState)(null);(0,_.useEffect)(()=>{N(new Set(e.read??[]))},[e]);let P=e.settings?.bigChangeLines??300,oe=(0,_.useCallback)((t,n)=>{re(null),N(e=>{let r=new Set(e);return n?r.add(t):r.delete(t),r});let r=fe();r!==null&&me(e.project.path,t,n,r).catch(e=>{re(e instanceof Error?e.message:String(e)),N(e=>{let r=new Set(e);return n?r.delete(t):r.add(t),r})})},[e.project.path]),se=(0,_.useMemo)(()=>Bf(e.sessions,M),[e,M]),ce=(0,_.useMemo)(()=>se.filter(e=>e.change.added+e.change.removed>=P),[se,P]),[le,ue]=(0,_.useState)(()=>n===null?null:n.messageId===void 0?`session:${n.sessionId}`:`node:session:${n.sessionId}:${n.messageId}`),de=Qf(e),pe=t.hash?.kind===`ok`?t.hash:null,ge=t.hits[Math.min(t.active,t.hits.length-1)]??null,_e=(0,_.useMemo)(()=>pe===null?ge===null?null:{sessionId:ge.sessionId,messageId:ge.messageId}:{sessionId:pe.sessionId,messageId:pe.messageId},[pe?.sessionId,pe?.messageId,ge?.sessionId,ge?.messageId]),ve=(0,_.useMemo)(()=>ae(t.hits),[t.hits]),ye=(0,_.useMemo)(()=>new Set(t.hits.flatMap(e=>e.messageId===null?[e.sessionId]:[])),[t.hits]),R=(0,_.useMemo)(()=>ie(t.hits),[t.hits]),be=(0,_.useRef)(r);be.current=r;let z=(0,_.useRef)(a);z.current=a,(0,_.useEffect)(()=>{let e=rh({open:be.current,bySearch:z.current},R);zh(e.open,be.current)||i(e.open),zh(e.bySearch,z.current)||o(e.bySearch)},[R]);let xe=c?.type===`node`?c:null,Se=(0,_.useMemo)(()=>{let t=new Map;for(let n of r){let r=Bh(e,n);if(!r)continue;let i={unfolded:u,openAll:b,rowWidth:f[n]??520,headId:de?.sessionId===n?de.messageId:null},a=ve.get(n);if(a!==void 0&&a.size>0){let e=bp(r.messages,i).segments.filter(e=>e.ids.some(e=>a.has(e))).map(e=>e.id);e.length>0&&(i={...i,unfolded:new Set([...u,...e])})}let o=bp(r.messages,i),s=xe?.sessionId===n?xe.nodeId:null;if(s!==null&&!o.rows.some(e=>e.kind===`message`&&e.message.id===s)){let e=o.segments.find(e=>e.ids.includes(s));e!==void 0&&(o=bp(r.messages,{...i,unfolded:new Set([...u,e.id])}))}t.set(n,o)}return t},[e,r,u,b,f,ve,de?.sessionId,de?.messageId,xe?.sessionId,xe?.nodeId]),Ce=(0,_.useMemo)(()=>{let e=new Map;for(let[t,n]of Se)e.set(t,Ah+(n.rows.length===0?Mh:n.height)+jh);return e},[Se]),we=(0,_.useMemo)(()=>lh(e,Ce),[e,Ce]),Te=(0,_.useMemo)(()=>{let e=[];for(let t of we.git.rows){if(t.kind!==`message`||t.spaceTop===void 0)continue;let n=we.sessions.get(t.message.id),r=Se.get(t.message.id);n&&r&&e.push({session:n,git:r,top:t.spaceTop+Ah,left:we.git.graphWidth+8})}return e},[we,Se]),Ee=(0,_.useCallback)((e,t)=>{if(t===void 0)return null;let n=Te.find(t=>t.session.sessionId===e),r=n?.git.rows.find(e=>e.kind===`message`&&e.message.id===t);return!n||!r?null:{x:n.left+n.git.graphWidth/2,y:n.top+r.y,left:n.left,right:n.left+n.git.width}},[Te]),De=(0,_.useCallback)(e=>{if(e.messageId!==null)return Ee(e.sessionId,e.messageId);let t=we.git.rows.find(t=>t.kind===`message`&&t.message.id===e.sessionId);return t===void 0?null:{x:we.git.graphWidth/2,y:t.y}},[Ee,we]),Oe=(0,_.useMemo)(()=>n===null?null:Ee(n.sessionId,n.messageId),[n,Ee]),[ke,Ae]=(0,_.useState)(0),[je,Me]=(0,_.useState)(0),Ne=(0,_.useMemo)(()=>Lh(e,!0),[e]),Pe=(0,_.useMemo)(()=>ke===0||Ne===null?null:{key:ke,point:Ee(Ne.sessionId,Ne.messageId)},[ke,Ne,Ee]),Fe=(0,_.useMemo)(()=>_e===null?null:De(_e),[_e,De]),Ie=(0,_.useMemo)(()=>t.step===0||Fe===null?null:{key:t.step,point:Fe},[t.step,Fe]),Le=(0,_.useCallback)(e=>{s(e),i(t=>t.has(e)?t:new Set([...t,e]))},[s]),Re=(0,_.useCallback)(e=>{if(s(e),r.has(e)){let t=new Set(r);t.delete(e),i(t),l(t=>t?.sessionId===e?null:t)}else i(new Set([...r,e])),ue(`session:${e}`)},[r,s]),ze=(0,_.useCallback)((e,t)=>{Le(e),ue(`node:session:${e}:${t}`),l({type:`node`,sessionId:e,nodeId:t})},[Le]),Be=(0,_.useCallback)((e,t)=>ze(e,t),[ze]);(0,_.useEffect)(()=>{pe!==null&&ze(pe.sessionId,pe.messageId)},[pe?.sessionId,pe?.messageId,ze]),(0,_.useEffect)(()=>{function t(){let t=Rh(e);t!==null&&(Le(t.sessionId),t.messageId!==void 0&&ze(t.sessionId,t.messageId),document.querySelector(`.lineage-map`)?.scrollIntoView({block:`start`}))}return window.addEventListener(`hashchange`,t),()=>window.removeEventListener(`hashchange`,t)},[e,Le,ze]);let Ve=(0,_.useCallback)(e=>{d(t=>{let n=new Set(t);return n.add(e),n})},[]),He=(0,_.useCallback)(e=>{ue(e.focusId),e.sessionId!==null&&Le(e.sessionId),l(e.selection)},[Le]),[Ue,We]=(0,_.useState)(0),Ge=(0,_.useCallback)(e=>{ze(e.sessionId,e.messageId),We(e=>e+1)},[ze]),Ke=(0,_.useMemo)(()=>xe===null?null:Ee(xe.sessionId,xe.nodeId),[xe?.sessionId,xe?.nodeId,Ee]),qe=(0,_.useMemo)(()=>Ue===0||Ke===null?null:{key:Ue,point:Ke},[Ue,Ke]),Je=(0,_.useMemo)(()=>({selection:c,openIds:r,readIds:M,bigChangeLines:P,openSession:Re,openNode:ze,openContinue:Be,unfold:Ve,resizeRows:v,storeRowWidth:y,person:O,people:A}),[c,r,M,P,Re,ze,Be,Ve,v,y,O,A]),Ye=(0,_.useMemo)(()=>{let t=Math.max(we.git.width,...Te.map(e=>e.left+e.git.width));return[{id:`project`,type:`project`,position:{x:0,y:0},width:t,height:we.git.height,style:{width:t,height:we.git.height},draggable:!1,connectable:!1,selectable:!1,data:{model:e,graph:we,openings:Te,highlights:ve,sessionHits:ye,activeHit:_e}}]},[e,we,Te,ve,ye,_e]);return(0,L.jsx)(Nh.Provider,{value:Je,children:(0,L.jsxs)(`div`,{className:ee?`map-shell is-expanded`:`map-shell`,children:[(0,L.jsxs)(`div`,{className:`map-toolbar`,children:[(0,L.jsx)(`span`,{className:`map-title`,children:`${we.git.rows.length} session${we.git.rows.length===1?``:`s`}`}),Ne?(0,L.jsx)(`button`,{type:`button`,className:`outline-button`,title:`Open the newest session and go to its newest message`,onClick:()=>{Le(Ne.sessionId),Ae(e=>e+1),document.querySelector(`.lineage-map`)?.scrollIntoView({block:`start`})},children:`\u21A7 Left off here`}):null,(0,L.jsx)(`button`,{type:`button`,className:`outline-button`,"aria-pressed":b,title:b?`Close every session and fold long branches again`:`Open every session and every folded branch`,onClick:()=>{i(b?new Set:new Set(we.sessions.keys())),o(new Set),b&&Me(e=>e+1),x(e=>!e),d(new Set)},children:b?`Fold all`:`Unfold all`}),j.length>0?(0,L.jsx)(`select`,{className:`person-filter`,"aria-label":`Whose sessions`,title:`Fade the other people\'s sessions; the lines between them stay`,value:Fp(O),onChange:e=>k(Pp(e.target.value)),children:j.map(e=>(0,L.jsx)(`option`,{value:e.value,children:e.label},e.value))}):null,(0,L.jsx)(`button`,{type:`button`,className:`outline-button`,"aria-pressed":ee,onClick:te,children:ee?`Exit full screen`:`Full screen`}),(0,L.jsx)(`button`,{type:`button`,className:`outline-button`,"aria-pressed":S,onClick:()=>{C(e=>!e),T(!1)},children:S?`Hide outline`:`Show outline`}),(0,L.jsx)(`button`,{type:`button`,className:`outline-button`,"aria-pressed":w,title:`Which conversations touched which file`,onClick:()=>{T(e=>!e),C(!1),D(!1)},children:w?`Hide files`:`Files`}),(0,L.jsx)(`button`,{type:`button`,className:`outline-button`,"aria-pressed":E,title:`Unread messages with commits, most code first`,onClick:()=>{D(e=>!e),C(!1),T(!1)},children:E?`Hide unread`:`Unread${ce.length>0?` (${ce.length})`:``}`})]}),(0,L.jsxs)(`div`,{className:`graph-wrap`,children:[E?(0,L.jsx)(kh,{messages:se,bigChangeLines:P,active:c?.type===`node`?{sessionId:c.sessionId,messageId:c.nodeId}:null,onSelect:Ge,onClose:()=>D(!1)}):w?(0,L.jsx)(ip,{files:e.files,active:c?.type===`node`?{sessionId:c.sessionId,messageId:c.nodeId}:null,onSelect:Ge,onClose:()=>T(!1)}):S?(0,L.jsx)(kp,{model:e,activeId:le,onSelect:He,onClose:()=>C(!1)}):null,(0,L.jsx)(`div`,{className:`graph-canvas`,children:we.git.rows.length===0?(0,L.jsx)(`p`,{className:`graph-status empty`,children:`No sessions recorded yet.`}):(0,L.jsx)(Hh,{nodes:Ye,focusRow:Oe,jump:Pe,searchJump:Ie,fileJump:qe,fit:je,refocus:m})}),(0,L.jsx)(Xm,{model:e,selection:c,onClose:()=>l(null),onNavigate:He,read:c?.type===`node`&&M.has(c.nodeId),onToggleRead:oe,bigChangeLines:P,readError:ne})]})]})})}function Hh({nodes:e,focusRow:t,jump:n,searchJump:r,fileJump:i,fit:a,refocus:o}){let{fitView:s,setViewport:c}=eu(),l=Th();function u(e){let t=document.querySelector(`.react-flow`)?.getBoundingClientRect();t&&c(rp(e,t,.9),{duration:300})}(0,_.useEffect)(()=>{if(a===0)return;let e=window.setTimeout(()=>void s({padding:.12,maxZoom:1,duration:300}),50);return()=>window.clearTimeout(e)},[a]);let d=n?.key??0,f=n?.point??null;(0,_.useEffect)(()=>{d!==0&&f!==null&&u(f)},[d]);let p=r?.key??0,m=r?.point??null;(0,_.useEffect)(()=>{p!==0&&m!==null&&u(m)},[p,m]);let h=i?.key??0,g=i?.point??null;return(0,_.useEffect)(()=>{h!==0&&g!==null&&u(g)},[h,g]),(0,_.useEffect)(()=>{if(o===0||t===null)return;let e=document.querySelector(`.react-flow`)?.getBoundingClientRect();e&&c(rp(t,e,.9))},[o]),(0,_.useEffect)(()=>{let e=window.setTimeout(()=>{let e=document.querySelector(`.react-flow`)?.getBoundingClientRect();t&&e?c(rp(t,e,.9)):s({padding:.12,maxZoom:1,duration:200})},80);return()=>window.clearTimeout(e)},[]),(0,L.jsx)(tf,{proOptions:{hideAttribution:!0},nodes:e,edges:[],nodeTypes:Ih,fitView:!0,panOnScroll:!0,minZoom:.05,maxZoom:2,nodesDraggable:!1,nodesConnectable:!1,elementsSelectable:!1,colorMode:l,children:(0,L.jsx)(_f,{showInteractive:!1})})}function Uh({model:e,search:t}){return(0,L.jsx)(`section`,{className:`lineage-map`,"aria-label":`Project lineage graph`,children:(0,L.jsx)(Zd,{children:(0,L.jsx)(Vh,{model:e,search:t})})})}function Wh(e,t){return`${e}\\0${t}`}function Gh(e,t){let n=Date.parse(e),r=Date.parse(t);if(Number.isNaN(n)||Number.isNaN(r))return``;let i=Math.max(0,Math.floor((r-n)/1e3));if(i<60)return`under a minute`;let a=Math.floor(i/60);if(a<60)return`${a} min`;let o=Math.floor(a/60);if(o<24)return`${o} h`;let s=Math.floor(o/24);return s===1?`1 day`:`${s} days`}function Kh(e){let t=de()?`/map?dir=${encodeURIComponent(e.projectPath)}`:e.mapUrl,n=new URLSearchParams({s:e.sessionId});return e.messageId!==void 0&&n.set(`m`,e.messageId),`${t}#${n.toString()}`}function qh(e){let t=0;for(let n of e)t=t*31+(n.codePointAt(0)??0)>>>0;return t%6}function Jh({row:e}){let t=[e.goal===``?``:`Goal: ${e.goal}`,e.lastDecision===``?``:`Last decision: ${e.lastDecision}`,e.pending.length===0?``:`Open: ${e.pending.map(e=>e.text).join(`; `)}`].filter(e=>e!==``);return t.length===0?null:(0,L.jsxs)(`p`,{className:`inbox-where`,children:[(0,L.jsx)(`span`,{className:`muted`,children:`Where we were, from the record:`}),` `,t.join(` \xB7 `)]})}function Yh({rows:e,collapsible:t=!1}){let[n,r]=(0,_.useState)(!t),[i,a]=(0,_.useState)(new Set),[o,s]=(0,_.useState)(null),c=e.filter(e=>!i.has(Wh(e.projectPath,e.sessionId)));if(c.length===0)return null;let l=new Date().toISOString();function u(e){let t=Wh(e.projectPath,e.sessionId);s(null),a(e=>new Set(e).add(t));let n=fe();n!==null&&ge(e.projectPath,e.sessionId,e.at,n).catch(e=>{s(e instanceof Error?e.message:String(e)),a(e=>{let n=new Set(e);return n.delete(t),n})})}return(0,L.jsxs)(`section`,{className:`inbox`,"aria-labelledby":`inbox-title`,children:[(0,L.jsx)(`h2`,{id:`inbox-title`,children:t?(0,L.jsxs)(`button`,{type:`button`,className:`inbox-toggle`,"aria-expanded":n,onClick:()=>r(e=>!e),children:[(0,L.jsx)(`span`,{className:`inbox-caret`,children:n?`\u25BE`:`\u25B8`}),` Your turn`,` `,(0,L.jsx)(`span`,{className:`muted inbox-count`,children:c.length})]}):(0,L.jsxs)(L.Fragment,{children:[`Your turn `,(0,L.jsx)(`span`,{className:`muted inbox-count`,children:c.length})]})}),n?(0,L.jsx)(`ul`,{className:`inbox-rows`,children:c.map(e=>(0,L.jsxs)(`li`,{className:`inbox-row`,style:{borderLeftColor:`var(--l${qh(e.projectPath)})`},children:[(0,L.jsxs)(`div`,{className:`inbox-head`,children:[(0,L.jsx)(`span`,{className:`inbox-project`,title:e.projectPath,children:e.projectName}),(0,L.jsx)(`span`,{className:`inbox-session`,children:e.sessionTitle}),(0,L.jsx)(`span`,{className:e.signal===`record`?`inbox-age is-record`:`inbox-age`,title:Uf(e.at),children:e.signal===`record`?`the record says it needs you \xB7 ${Gh(e.at,l)}`:`your turn for ${Gh(e.at,l)}`}),(0,L.jsx)(`button`,{type:`button`,className:`inbox-dismiss`,"aria-label":`Dismiss`,title:fe()===null?`Hide until this page is reloaded`:`Hide until the agent writes in this session again`,onClick:()=>u(e),children:`\xD7`})]}),e.lastMessage===void 0?null:(0,L.jsx)(`p`,{className:`inbox-message`,children:e.lastMessage}),e.signal===`both`?(0,L.jsx)(`p`,{className:`inbox-signal`,children:`The record says it needs you.`}):null,(0,L.jsx)(Jh,{row:e}),(0,L.jsxs)(`div`,{className:`inbox-actions`,children:[(0,L.jsx)(`a`,{className:`inbox-open`,href:Kh(e),children:e.messageId===void 0?`Open the map \u2192`:`Open at this message \u2192`}),(0,L.jsx)(lm,{projectPath:e.projectPath,sessionId:e.sessionId,available:e.transcriptAvailable})]})]},Wh(e.projectPath,e.sessionId)))}):null,o===null?null:(0,L.jsx)(`p`,{className:`muted inbox-error`,children:o})]})}function Xh({value:e,state:t,onQuery:n,onStep:r,onClear:i}){let a=(0,_.useRef)(null);(0,_.useEffect)(()=>{function e(e){(e.metaKey||e.ctrlKey)&&e.key.toLowerCase()===`f`&&document.activeElement!==a.current&&(e.preventDefault(),a.current?.focus(),a.current?.select())}return window.addEventListener(`keydown`,e),()=>window.removeEventListener(`keydown`,e)},[]);function o(e){e.key===`Escape`?(e.preventDefault(),i(),a.current?.blur()):t.hash===null&&e.key===`Enter`&&(e.preventDefault(),r(e.shiftKey?-1:1))}let s=t.hits.length,c=Math.min(t.active,s-1),l=t.hash===null?e.trim()===``?``:s===0?`0 hits`:`${c+1} / ${s}`:t.hash.kind===`ok`?`1 / 1`:t.hash.kind===`ambiguous`?`${t.hash.count} matches`:`no match`,u=t.hash===null?s===0&&e.trim()!==``?`no matches`:null:t.hash.kind===`ok`?`\u2192 ${t.hash.label??t.hash.messageId} \xB7 ${t.hash.title}`:t.hash.kind===`ambiguous`?`several messages match \u2014 type more of the hash`:`no recorded message has that hash`;return(0,L.jsxs)(`div`,{className:`map-search`,role:`search`,children:[(0,L.jsxs)(`div`,{className:`map-search-row`,children:[(0,L.jsx)(`input`,{ref:a,type:`search`,className:`map-search-input`,placeholder:`Search the lineage`,"aria-label":`Search the lineage`,value:e,onChange:e=>n(e.target.value),onKeyDown:o}),l===``?null:(0,L.jsx)(`span`,{className:`map-search-count`,children:l}),t.hash===null&&s>0?(0,L.jsxs)(L.Fragment,{children:[(0,L.jsx)(`button`,{type:`button`,className:`map-search-step`,"aria-label":`Previous hit`,title:`Previous hit (Shift+Enter)`,disabled:c<=0,onClick:()=>r(-1),children:`\u2191`}),(0,L.jsx)(`button`,{type:`button`,className:`map-search-step`,"aria-label":`Next hit`,title:`Next hit (Enter)`,disabled:c>=s-1,onClick:()=>r(1),children:`\u2193`})]}):null]}),u===null?null:(0,L.jsx)(`p`,{className:`map-search-hint`,children:u})]})}o(((e,t)=>{t.exports={}}))();function Zh(e){return e.slice(0,6)}function Qh(e,t){let n=t.trim().toLowerCase();return n===``?e:e.filter(e=>`${e.name} ${e.path} ${e.leftOff}`.toLowerCase().includes(n))}function $h(e){return`${de()?`/map?dir=${encodeURIComponent(e.path)}`:e.lineageUrl}#focus=head`}function eg(){return/mac/i.test(navigator.platform)?`\u2318 K`:`Ctrl K`}function tg({model:e}){let t=(0,_.useMemo)(()=>e.switcher??[],[e.switcher]),[n,r]=(0,_.useState)(!1),[i,a]=(0,_.useState)(``),[o,s]=(0,_.useState)(0),c=(0,_.useRef)(null),l=(0,_.useMemo)(()=>Qh(t,i),[t,i]),u=Zh(t);if((0,_.useEffect)(()=>{function e(e){(e.metaKey||e.ctrlKey)&&e.key.toLowerCase()===`k`?(e.preventDefault(),r(e=>!e),a(``),s(0)):e.key===`Escape`&&r(!1)}return window.addEventListener(`keydown`,e),()=>window.removeEventListener(`keydown`,e)},[]),(0,_.useEffect)(()=>{n&&c.current?.focus()},[n]),t.length===0)return null;function d(e){window.location.href=$h(e)}function f(e){if(e.key===`ArrowDown`)e.preventDefault(),s(e=>Math.min(e+1,Math.max(l.length-1,0)));else if(e.key===`ArrowUp`)e.preventDefault(),s(e=>Math.max(e-1,0));else if(e.key===`Enter`){e.preventDefault();let t=l[o];t&&d(t)}}return(0,L.jsxs)(`div`,{className:`switcher`,children:[(0,L.jsxs)(`nav`,{className:`switcher-tabs`,"aria-label":`Recent projects`,children:[u.map(e=>(0,L.jsxs)(`a`,{"aria-current":e.current?`page`:void 0,className:e.current?`switcher-tab is-current`:`switcher-tab`,href:$h(e),title:e.leftOff||e.path,children:[(0,L.jsx)(`span`,{className:`switcher-name`,children:e.name}),(0,L.jsx)(`span`,{className:`switcher-time`,children:Wf(e.lastActivity)})]},e.path)),(0,L.jsxs)(`button`,{type:`button`,className:`switcher-more`,onClick:()=>{r(!0),a(``),s(0)},"aria-haspopup":`dialog`,children:[`Switch project `,(0,L.jsx)(`kbd`,{children:eg()})]})]}),n?(0,L.jsx)(`div`,{className:`switcher-overlay`,onMouseDown:e=>{e.target===e.currentTarget&&r(!1)},children:(0,L.jsxs)(`div`,{className:`switcher-dialog`,role:`dialog`,"aria-modal":`true`,"aria-label":`Switch project`,children:[(0,L.jsx)(`input`,{ref:c,className:`switcher-input`,role:`combobox`,"aria-expanded":`true`,"aria-controls":`switcher-results`,"aria-activedescendant":l[o]?`switcher-${o}`:void 0,"aria-autocomplete":`list`,placeholder:`Search projects by name, path or where you left off\u2026`,value:i,onChange:e=>{a(e.target.value),s(0)},onKeyDown:f}),l.length===0?(0,L.jsx)(`p`,{className:`empty switcher-none`,children:`No project matches.`}):(0,L.jsx)(`ul`,{className:`switcher-results`,id:`switcher-results`,role:`listbox`,children:l.map((e,t)=>(0,L.jsxs)(`li`,{id:`switcher-${t}`,role:`option`,"aria-selected":t===o,className:t===o?`switcher-result is-active`:`switcher-result`,onMouseMove:()=>s(t),onClick:()=>d(e),children:[(0,L.jsxs)(`span`,{className:`switcher-result-head`,children:[(0,L.jsx)(`span`,{className:`switcher-name`,children:e.name}),e.current?(0,L.jsx)(`span`,{className:`badge`,children:`current`}):null,(0,L.jsx)(`span`,{className:`switcher-time`,children:Uf(e.lastActivity)})]}),(0,L.jsx)(`span`,{className:`switcher-leftoff`,children:e.leftOff||`Nothing recorded yet.`}),(0,L.jsx)(`span`,{className:`switcher-path`,children:e.path})]},e.path))}),(0,L.jsx)(`p`,{className:`switcher-hint`,children:`\u2191\u2193 to move \xB7 Enter to open \xB7 Esc to close`})]})}):null]})}var ng=[{key:`recorder`,label:`Recording`,help:`How much of the chat goes into the record.`,details:"Economical (recommended): a small model records in the background every few turns and closes each session with one pass that finds its threads, writes the branch summaries and one line on where the session left off. The agent is never interrupted; it costs about a cent per session. Detailed: on top of that, the main agent records its own decisions every 15 turns. It catches the agent\'s technical choices best and costs about 1\u20132% of a session. A third mode, where only the main agent records, is set with `cogit config set recorder agent`.",kind:`select`,options:[{value:`side`,label:`Economical (recommended)`},{value:`mixed`,label:`Detailed`}]},{key:`messageSummaries`,label:`One-line summary under each message`,help:`A sentence under each message title on the map.`,details:`A one-sentence summary under each message title, so a skim reads better. Off keeps the record shorter and cheaper. Branch summaries and the line on where a session left off are written either way.`,kind:`boolean`},{key:`startupContext`,label:`Lineage at session start`,help:`Hand the agent the previous session\'s lineage when a chat starts.`,details:`When a chat starts, the agent gets a short summary of where the previous session left off and how to read the record. It costs a few tokens; turn it off if your projects are unrelated.`,kind:`boolean`},{key:`recordHeadless`,label:`Headless sessions`,help:"Record sessions that start without a person, such as `claude -p`.",details:"Some plugins and scripts run `claude -p` in the background, often once per prompt. Off, cogit leaves those sessions out of the map and the inbox. Turn it on if you do real work through `claude -p` or the SDK and want it recorded.",kind:`boolean`},{key:`tryBeforeNotes`,label:`Tried-before notes`,help:`Before the agent edits a file, tell it which options earlier thoughts rejected for it.`,details:`Before the agent edits a file, it hears which options earlier thoughts tried and rejected for that file. These are notes from the record, never rules; they can make the agent ask before repeating a dead end.`,kind:`boolean`},{key:`shapes`,label:`Intent, Shape and Code`,help:`A small picture of what each change does, beside its reason and its diff.`,details:`For every message that landed commits, a small representation of what the change does: numbered plain-language steps or a Mermaid diagram. It sits between the record\'s intent (the decision, reason and rejected options) and the code (the diff), so a reviewer sees why, what and how in one place. The recorder writes it, not you; it costs one small model call per such message. Off, the map says so and nothing is written.`,kind:`boolean`},{key:`language`,label:`Language`,help:"Language the agent writes records in; `auto` follows the chat.",details:`The language the record is written in. With auto, it follows the language of the conversation.`,kind:`text`},{key:`shareConversations`,label:`Share conversations`,help:`Commit the raw chat text too, not only the session record (off: chat stays local).`,details:`Also commit the raw chat text, not only the record. Leave it off to keep conversations on your machine while the record still travels with the branch.`,kind:`boolean`},{key:`recordCommit`,label:`Commit the record`,help:`ask, auto or off: what to do with the last messages after the last code commit.`,details:`What happens to record changes made after your last code commit: ask you next time, commit them automatically, or leave them for you to commit.`,kind:`text`}];function rg(e){return[{title:`Recording`,fields:ng.map(t=>({...t,editable:e}))}]}var ig={recorder:`side`,language:`auto`,updateEveryTurns:15,sideEveryTurns:5,sessionEndCatchUp:!0,sideModel:`haiku`,messageSummaries:!1,startupContext:!0,recordHeadless:!1,tryBeforeNotes:!0,shapes:!0,shareConversations:!1,recordCommit:`ask`,gitPolicy:`commit`,agents:[`claude-code`],bigChangeLines:300};function ag(e){return{...ig,...e}}function og(e){return Array.isArray(e)?e.length>0?e.join(`, `):`\u2014`:typeof e==`boolean`?e?`yes`:`no`:e===void 0?`\u2014`:String(e)}function sg({id:e,field:t}){let[n,r]=(0,_.useState)(!1),[i,a]=(0,_.useState)(!1),o=n||i,s=`${e}-details`;return(0,L.jsxs)(`span`,{className:`settings-why-wrap`,onMouseEnter:()=>r(!0),onMouseLeave:()=>r(!1),children:[(0,L.jsx)(`span`,{className:`settings-why`,tabIndex:0,role:`img`,"aria-label":`What does ${t.label} do?`,"aria-describedby":o?s:void 0,onFocus:()=>a(!0),onBlur:()=>a(!1),onKeyDown:e=>{e.key===`Escape`&&o&&(e.stopPropagation(),r(!1),a(!1))},children:`?`}),o?(0,L.jsx)(`span`,{className:`settings-details`,id:s,role:`tooltip`,children:t.details}):null]})}function cg(e,t){return e.kind===`boolean`?!!t:e.kind===`number`?Number(t):String(t)}function lg(e,t,n){return e.kind===`boolean`?!!t!=!!n:String(t)!==String(n)}function ug({id:e,field:t,value:n,draft:r,error:i,onChange:a}){let o=r??(t.kind===`boolean`?!!n:String(n));return(0,L.jsxs)(`div`,{className:r===void 0?`settings-field`:`settings-field is-changed`,children:[(0,L.jsxs)(`div`,{className:`settings-field-text`,children:[(0,L.jsxs)(`span`,{className:`settings-label`,children:[(0,L.jsx)(`label`,{htmlFor:e,children:t.label}),(0,L.jsx)(sg,{id:e,field:t})]}),(0,L.jsx)(`p`,{className:`settings-help`,id:`${e}-help`,children:t.help})]}),(0,L.jsxs)(`div`,{className:`setting-form`,children:[t.kind===`boolean`?(0,L.jsx)(`input`,{id:e,type:`checkbox`,checked:!!o,"aria-describedby":`${e}-help`,onChange:e=>a(t,e.target.checked)}):t.kind===`select`?(0,L.jsxs)(`select`,{id:e,value:String(o),"aria-describedby":`${e}-help`,onChange:e=>a(t,e.target.value),children:[(t.options??[]).map(e=>(0,L.jsx)(`option`,{value:e.value,children:e.label},e.value)),(t.options??[]).some(e=>e.value===String(o))?null:(0,L.jsx)(`option`,{value:String(o),children:String(o)})]}):(0,L.jsx)(`input`,{id:e,type:t.kind===`number`?`number`:`text`,value:String(o),"aria-describedby":`${e}-help`,onChange:e=>a(t,e.target.value)}),i?(0,L.jsx)(`span`,{className:`setting-error`,children:i}):null]})]})}function dg({embedded:e,onClose:t}){let n=de()?fe():null,[r,i]=(0,_.useState)(()=>ag(e)),[a,o]=(0,_.useState)(n!==null),[s,c]=(0,_.useState)(null),[l,u]=(0,_.useState)({}),[d,f]=(0,_.useState)({}),[p,m]=(0,_.useState)(!1),[h,g]=(0,_.useState)(null),v=(0,_.useRef)(null);(0,_.useEffect)(()=>{v.current?.focus()},[]),(0,_.useEffect)(()=>{function e(e){e.key===`Escape`&&t()}return window.addEventListener(`keydown`,e),()=>window.removeEventListener(`keydown`,e)},[t]),(0,_.useEffect)(()=>{if(!n)return;let e=!0;return pe(n).then(t=>{e&&i(e=>({...e,...t}))}).catch(t=>{e&&c(t instanceof Error?t.message:String(t))}).finally(()=>{e&&o(!1)}),()=>{e=!1}},[n]);let y=n!==null,b=rg(y),x=new Map(b.flatMap(e=>e.fields).map(e=>[e.key,e])),S=Object.keys(l);function C(e,t){u(n=>{let i={...n};return lg(e,t,r[e.key])?i[e.key]=t:delete i[e.key],i}),f(t=>{let n={...t};return delete n[e.key],n}),g(null)}async function w(e){if(e.preventDefault(),!n||p||S.length===0)return;m(!0),g(null);let t={};for(let e of S){let r=x.get(e),a=l[e];if(!r||a===void 0)continue;let o=cg(r,a);try{await ve(e,o,n),i(t=>({...t,[e]:o})),u(t=>{let n={...t};return delete n[e],n})}catch(n){t[e]=n instanceof Error?n.message:String(n)}}f(t);let r=Object.keys(t).length;g(r===0?`Saved`:`${r} not saved`),m(!1)}return(0,L.jsx)(`div`,{className:`settings-overlay`,onMouseDown:e=>{e.target===e.currentTarget&&t()},children:(0,L.jsxs)(`div`,{className:`settings-dialog`,role:`dialog`,"aria-modal":`true`,"aria-labelledby":`settings-title`,children:[(0,L.jsxs)(`div`,{className:`settings-head`,children:[(0,L.jsx)(`h2`,{id:`settings-title`,children:`Settings`}),(0,L.jsx)(`button`,{ref:v,type:`button`,className:`settings-close`,"aria-label":`Close settings`,onClick:t,children:`\xD7`})]}),(0,L.jsx)(`p`,{className:`muted`,children:y?`A change here applies to new builds and chats.`:"Read-only. Open this page with `cogit open` to change settings, or use `cogit config set <key> <value>`."}),a?(0,L.jsx)(`p`,{className:`settings-help`,children:`Reading the current settings\u2026`}):null,s?(0,L.jsx)(`p`,{className:`setting-error`,children:s}):null,(0,L.jsxs)(`form`,{onSubmit:w,children:[b.map(e=>(0,L.jsxs)(`section`,{className:`settings-section`,"aria-label":e.title,children:[(0,L.jsx)(`h3`,{children:e.title}),e.fields.map(e=>{let t=`setting-${e.key}`,i=r[e.key];return e.editable&&n?(0,L.jsx)(ug,{id:t,field:e,value:i,draft:l[e.key],error:d[e.key],onChange:C},e.key):(0,L.jsxs)(`div`,{className:`settings-field`,children:[(0,L.jsxs)(`div`,{className:`settings-field-text`,children:[(0,L.jsxs)(`span`,{className:`settings-label`,children:[e.label,(0,L.jsx)(sg,{id:t,field:e})]}),(0,L.jsx)(`p`,{className:`settings-help`,id:`${t}-help`,children:e.help})]}),(0,L.jsx)(`span`,{className:`settings-value`,children:og(i)})]},e.key)})]},e.title)),y?(0,L.jsxs)(`div`,{className:`settings-foot`,children:[(0,L.jsx)(`span`,{className:`setting-status`,role:`status`,children:p?`Saving\u2026`:S.length>0?`${S.length} unsaved ${S.length===1?`change`:`changes`}`:h??``}),(0,L.jsx)(`button`,{type:`submit`,disabled:S.length===0||p,children:`Save`})]}):null]})]})})}function fg({settings:e}){let[t,n]=(0,_.useState)(!1),r=(0,_.useRef)(null);function i(){n(!1),r.current?.focus()}return(0,L.jsxs)(L.Fragment,{children:[(0,L.jsxs)(`button`,{ref:r,type:`button`,className:`settings-button`,"aria-haspopup":`dialog`,"aria-expanded":t,onClick:()=>n(!0),children:[(0,L.jsx)(`span`,{"aria-hidden":`true`,children:`\u2699`}),` Settings`]}),t?(0,L.jsx)(dg,{embedded:e,onClose:i}):null]})}function pg({model:e}){let[t,n]=(0,_.useState)(``),[r,i]=(0,_.useState)(0),[a,o]=(0,_.useState)(0),s=(0,_.useDeferredValue)(t),c=(0,_.useMemo)(()=>oe(s)?se(e,s):null,[e,s]),l=(0,_.useMemo)(()=>c===null?ce(e,s):[],[e,s,c]),u={hits:l,active:r,step:a,hash:c};function d(e){n(e),i(0),o(e=>e+1)}function f(e){i(t=>P(t,l.length,e)),o(e=>e+1)}function p(){n(``),i(0),o(0)}return(0,L.jsxs)(`main`,{className:`map-page`,children:[(0,L.jsxs)(`div`,{className:`page-head`,children:[(0,L.jsxs)(`div`,{className:`page-bar page-bar-centered`,children:[(0,L.jsx)(R,{}),(0,L.jsxs)(`div`,{className:`page-title`,children:[(0,L.jsx)(`h1`,{children:e.project.name}),(0,L.jsx)(`p`,{className:`muted`,children:e.project.path})]}),(0,L.jsxs)(`div`,{className:`page-bar-actions`,children:[(0,L.jsx)(Xh,{value:t,state:u,onQuery:d,onStep:f,onClear:p}),(0,L.jsx)(Oh,{}),(0,L.jsx)(fg,{settings:e.settings})]})]}),(0,L.jsx)(`header`,{className:`project`,children:(0,L.jsxs)(`div`,{children:[(0,L.jsx)(tg,{model:e}),(0,L.jsx)(be,{})]})}),(0,L.jsx)(Yh,{rows:e.inbox??[],collapsible:!0})]}),(0,L.jsx)(Uh,{model:e,search:u})]})}function mg(e){return e.lineageUrl?typeof document<`u`&&de()?`/map?dir=${encodeURIComponent(e.path)}`:e.lineageUrl:null}function hg({model:e}){return(0,L.jsxs)(`main`,{className:`panel-page`,children:[(0,L.jsx)(`div`,{className:`page-bar`,children:(0,L.jsx)(R,{home:!0})}),(0,L.jsxs)(`header`,{className:`project`,children:[(0,L.jsxs)(`div`,{children:[(0,L.jsx)(`h1`,{children:`Projects`}),(0,L.jsx)(`p`,{className:`muted`,children:`Every project cogit knows about.`})]}),(0,L.jsxs)(`div`,{className:`page-actions`,children:[(0,L.jsx)(Oh,{}),(0,L.jsx)(fg,{settings:e.settings}),(0,L.jsxs)(`div`,{className:`meta`,children:[(0,L.jsxs)(`span`,{children:[e.projects.length,` `,e.projects.length===1?`project`:`projects`]}),(0,L.jsxs)(`span`,{className:`muted`,children:[`generated `,Uf(e.generatedAt)]})]})]})]}),(0,L.jsx)(Yh,{rows:e.inbox??[]}),e.projects.length===0?(0,L.jsx)(`p`,{className:`empty`,children:"No projects registered yet. Run `cogit init` in a project."}):(0,L.jsx)(`ul`,{className:`panel-grid`,children:e.projects.map(e=>{let t=mg(e);return(0,L.jsxs)(`li`,{className:e.missing?`card missing`:`card`,children:[(0,L.jsxs)(`div`,{className:`card-head`,children:[(0,L.jsx)(`h2`,{children:e.name}),e.missing?(0,L.jsx)(`span`,{className:`badge`,title:"This directory is gone. `cogit config prune` removes it from the panel.",children:`missing`}):null]}),(0,L.jsx)(`p`,{className:`muted path`,children:e.path}),(0,L.jsxs)(`dl`,{className:`card-facts`,children:[(0,L.jsxs)(`div`,{children:[(0,L.jsx)(`dt`,{children:`Last activity`}),(0,L.jsx)(`dd`,{children:Uf(e.lastActivity)})]}),(0,L.jsxs)(`div`,{children:[(0,L.jsx)(`dt`,{children:`Waiting on you`}),(0,L.jsx)(`dd`,{children:e.needsUserCount})]}),e.unreadBigCount===void 0?null:(0,L.jsxs)(`div`,{children:[(0,L.jsx)(`dt`,{title:`Unread messages whose commits changed at least the big-change threshold of lines`,children:`Unread big changes`}),(0,L.jsx)(`dd`,{children:e.unreadBigCount})]})]}),t?(0,L.jsx)(`a`,{className:`card-open`,href:t,children:`Open the map \u2192`}):(0,L.jsx)(`p`,{className:`empty`,children:`Directory not found.`})]},e.path)})})]})}wh();async function gg(){try{let e=await fetch(location.href,{cache:`no-store`});if(!e.ok)return null;let t=new DOMParser().parseFromString(await e.text(),`text/html`).getElementById(y)?.textContent?.trim();return t?le(t):null}catch{return null}}function _g({initial:e}){let[t,n]=(0,_.useState)(e);return(0,_.useEffect)(()=>{if(!de())return;let e=new EventSource(`/events${location.search}`);return e.addEventListener(`change`,()=>{gg().then(e=>{e&&n(e)})}),()=>e.close()},[]),t.kind===`lineage`?(0,L.jsx)(pg,{model:t}):(0,L.jsx)(hg,{model:t})}var vg=document.getElementById(`root`);if(!vg)throw Error(`missing #root`);ue().then(e=>{(0,v.createRoot)(vg).render((0,L.jsx)(_.StrictMode,{children:(0,L.jsx)(_g,{initial:e})}))}).catch(e=>{let t=document.createElement(`p`);t.className=`error`,t.textContent=e instanceof Error?e.message:String(e),vg.replaceChildren(t)});</script>\n    <style rel="stylesheet" crossorigin>.react-flow{--xy-edge-stroke-default:#b1b1b7;--xy-edge-stroke-width-default:1;--xy-edge-stroke-selected-default:#555;--xy-connectionline-stroke-default:#b1b1b7;--xy-connectionline-stroke-width-default:1;--xy-attribution-background-color-default:#ffffff80;--xy-minimap-background-color-default:#fff;--xy-minimap-mask-background-color-default:#f0f0f099;--xy-minimap-mask-stroke-color-default:transparent;--xy-minimap-mask-stroke-width-default:1;--xy-minimap-node-background-color-default:#e2e2e2;--xy-minimap-node-stroke-color-default:transparent;--xy-minimap-node-stroke-width-default:2;--xy-background-color-default:transparent;--xy-background-pattern-dots-color-default:#91919a;--xy-background-pattern-lines-color-default:#eee;--xy-background-pattern-cross-color-default:#e2e2e2;background-color:var(--xy-background-color,var(--xy-background-color-default));--xy-node-color-default:inherit;--xy-node-border-default:1px solid #1a192b;--xy-node-background-color-default:#fff;--xy-node-group-background-color-default:#f0f0f040;--xy-node-boxshadow-hover-default:0 1px 4px 1px #00000014;--xy-node-boxshadow-selected-default:0 0 0 .5px #1a192b;--xy-node-border-radius-default:3px;--xy-handle-background-color-default:#1a192b;--xy-handle-border-color-default:#fff;--xy-selection-background-color-default:#0059dc14;--xy-selection-border-default:1px dotted #0059dccc;--xy-controls-button-background-color-default:#fefefe;--xy-controls-button-background-color-hover-default:#f4f4f4;--xy-controls-button-color-default:inherit;--xy-controls-button-color-hover-default:inherit;--xy-controls-button-border-color-default:#eee;--xy-controls-box-shadow-default:0 0 2px 1px #00000014;--xy-edge-label-background-color-default:#fff;--xy-edge-label-color-default:inherit;--xy-resize-background-color-default:#3367d9;direction:ltr}.react-flow.dark{--xy-edge-stroke-default:#3e3e3e;--xy-edge-stroke-width-default:1;--xy-edge-stroke-selected-default:#727272;--xy-connectionline-stroke-default:#b1b1b7;--xy-connectionline-stroke-width-default:1;--xy-attribution-background-color-default:#96969640;--xy-minimap-background-color-default:#141414;--xy-minimap-mask-background-color-default:#3c3c3c99;--xy-minimap-mask-stroke-color-default:transparent;--xy-minimap-mask-stroke-width-default:1;--xy-minimap-node-background-color-default:#2b2b2b;--xy-minimap-node-stroke-color-default:transparent;--xy-minimap-node-stroke-width-default:2;--xy-background-color-default:#141414;--xy-background-pattern-dots-color-default:#555;--xy-background-pattern-lines-color-default:#333;--xy-background-pattern-cross-color-default:#333;--xy-node-color-default:#f8f8f8;--xy-node-border-default:1px solid #3c3c3c;--xy-node-background-color-default:#1e1e1e;--xy-node-group-background-color-default:#f0f0f040;--xy-node-boxshadow-hover-default:0 1px 4px 1px #ffffff14;--xy-node-boxshadow-selected-default:0 0 0 .5px #999;--xy-handle-background-color-default:#bebebe;--xy-handle-border-color-default:#1e1e1e;--xy-selection-background-color-default:#c8c8dc14;--xy-selection-border-default:1px dotted #c8c8dccc;--xy-controls-button-background-color-default:#2b2b2b;--xy-controls-button-background-color-hover-default:#3e3e3e;--xy-controls-button-color-default:#f8f8f8;--xy-controls-button-color-hover-default:#fff;--xy-controls-button-border-color-default:#5b5b5b;--xy-controls-box-shadow-default:0 0 2px 1px #00000014;--xy-edge-label-background-color-default:#141414;--xy-edge-label-color-default:#f8f8f8}.react-flow__background{background-color:var(--xy-background-color-props,var(--xy-background-color,var(--xy-background-color-default)));pointer-events:none;z-index:-1}.react-flow__container{width:100%;height:100%;position:absolute;top:0;left:0}.react-flow__pane{z-index:1;touch-action:none}.react-flow__pane.draggable{cursor:grab}.react-flow__pane.dragging{cursor:grabbing}.react-flow__pane.selection{cursor:pointer}.react-flow__viewport{transform-origin:0 0;z-index:2;pointer-events:none}.react-flow__renderer{z-index:4}.react-flow__selection{z-index:6}.react-flow__nodesselection-rect:focus,.react-flow__nodesselection-rect:focus-visible{outline:none}.react-flow__edge-path{stroke:var(--xy-edge-stroke,var(--xy-edge-stroke-default));stroke-width:var(--xy-edge-stroke-width,var(--xy-edge-stroke-width-default));fill:none}.react-flow__connection-path{stroke:var(--xy-connectionline-stroke,var(--xy-connectionline-stroke-default));stroke-width:var(--xy-connectionline-stroke-width,var(--xy-connectionline-stroke-width-default));fill:none}.react-flow .react-flow__edges{position:absolute}.react-flow .react-flow__edges svg{pointer-events:none;position:absolute;overflow:visible}.react-flow__edge{pointer-events:visibleStroke}.react-flow__edge.selectable{cursor:pointer}.react-flow__edge.animated path{stroke-dasharray:5;animation:.5s linear infinite dashdraw}.react-flow__edge.animated path.react-flow__edge-interaction{stroke-dasharray:none;animation:none}.react-flow__edge.inactive{pointer-events:none}.react-flow__edge.selected,.react-flow__edge:focus,.react-flow__edge:focus-visible{outline:none}.react-flow__edge.selected .react-flow__edge-path,.react-flow__edge.selectable:focus .react-flow__edge-path,.react-flow__edge.selectable:focus-visible .react-flow__edge-path{stroke:var(--xy-edge-stroke-selected,var(--xy-edge-stroke-selected-default))}.react-flow__edge-textwrapper{pointer-events:all}.react-flow__edge .react-flow__edge-text{pointer-events:none;-webkit-user-select:none;user-select:none}.react-flow__arrowhead polyline{stroke:var(--xy-edge-stroke,var(--xy-edge-stroke-default))}.react-flow__arrowhead polyline.arrowclosed{fill:var(--xy-edge-stroke,var(--xy-edge-stroke-default))}.react-flow__connection{pointer-events:none}.react-flow__connection .animated{stroke-dasharray:5;animation:.5s linear infinite dashdraw}svg.react-flow__connectionline{z-index:1001;position:absolute;overflow:visible}.react-flow__nodes{pointer-events:none;transform-origin:0 0}.react-flow__node{-webkit-user-select:none;user-select:none;pointer-events:all;transform-origin:0 0;box-sizing:border-box;cursor:default;position:absolute}.react-flow__node.selectable{cursor:pointer}.react-flow__node.draggable{cursor:grab;pointer-events:all}.react-flow__node.draggable.dragging{cursor:grabbing}.react-flow__nodesselection{z-index:3;transform-origin:0 0;pointer-events:none}.react-flow__nodesselection-rect{pointer-events:all;cursor:grab;position:absolute}.react-flow__handle{pointer-events:none;background-color:var(--xy-handle-background-color,var(--xy-handle-background-color-default));border:1px solid var(--xy-handle-border-color,var(--xy-handle-border-color-default));border-radius:100%;width:6px;min-width:5px;height:6px;min-height:5px;position:absolute}.react-flow__handle.connectingfrom{pointer-events:all}.react-flow__handle.connectionindicator{pointer-events:all;cursor:crosshair}.react-flow__handle-bottom{top:auto;bottom:0;left:50%;transform:translate(-50%,50%)}.react-flow__handle-top{top:0;left:50%;transform:translate(-50%,-50%)}.react-flow__handle-left{top:50%;left:0;transform:translate(-50%,-50%)}.react-flow__handle-right{top:50%;right:0;transform:translate(50%,-50%)}.react-flow__edgeupdater{cursor:move;pointer-events:all}.react-flow__pane.selection .react-flow__panel{pointer-events:none}.react-flow__panel{z-index:5;margin:15px;position:absolute}.react-flow__panel.top{top:0}.react-flow__panel.bottom{bottom:0}.react-flow__panel.top.center,.react-flow__panel.bottom.center{left:50%;transform:translate(-15px)translate(-50%)}.react-flow__panel.left{left:0}.react-flow__panel.right{right:0}.react-flow__panel.left.center,.react-flow__panel.right.center{top:50%;transform:translateY(-15px)translateY(-50%)}.react-flow__attribution{background:var(--xy-attribution-background-color,var(--xy-attribution-background-color-default));margin:0;padding:2px 3px;font-size:10px}.react-flow__attribution a{color:#999;text-decoration:none}@keyframes dashdraw{0%{stroke-dashoffset:10px}}.react-flow__edgelabel-renderer{pointer-events:none;-webkit-user-select:none;user-select:none;width:100%;height:100%;position:absolute;top:0;left:0}.react-flow__viewport-portal{-webkit-user-select:none;user-select:none;width:100%;height:100%;position:absolute;top:0;left:0}.react-flow__minimap{background:var(--xy-minimap-background-color-props,var(--xy-minimap-background-color,var(--xy-minimap-background-color-default)))}.react-flow__minimap-svg{display:block}.react-flow__minimap-mask{fill:var(--xy-minimap-mask-background-color-props,var(--xy-minimap-mask-background-color,var(--xy-minimap-mask-background-color-default)));stroke:var(--xy-minimap-mask-stroke-color-props,var(--xy-minimap-mask-stroke-color,var(--xy-minimap-mask-stroke-color-default)));stroke-width:var(--xy-minimap-mask-stroke-width-props,var(--xy-minimap-mask-stroke-width,var(--xy-minimap-mask-stroke-width-default)))}.react-flow__minimap-node{fill:var(--xy-minimap-node-background-color-props,var(--xy-minimap-node-background-color,var(--xy-minimap-node-background-color-default)));stroke:var(--xy-minimap-node-stroke-color-props,var(--xy-minimap-node-stroke-color,var(--xy-minimap-node-stroke-color-default)));stroke-width:var(--xy-minimap-node-stroke-width-props,var(--xy-minimap-node-stroke-width,var(--xy-minimap-node-stroke-width-default)))}.react-flow__background-pattern.dots{fill:var(--xy-background-pattern-color-props,var(--xy-background-pattern-color,var(--xy-background-pattern-dots-color-default)))}.react-flow__background-pattern.lines{stroke:var(--xy-background-pattern-color-props,var(--xy-background-pattern-color,var(--xy-background-pattern-lines-color-default)))}.react-flow__background-pattern.cross{stroke:var(--xy-background-pattern-color-props,var(--xy-background-pattern-color,var(--xy-background-pattern-cross-color-default)))}.react-flow__controls{box-shadow:var(--xy-controls-box-shadow,var(--xy-controls-box-shadow-default));flex-direction:column;display:flex}.react-flow__controls.horizontal{flex-direction:row}.react-flow__controls-button{background:var(--xy-controls-button-background-color,var(--xy-controls-button-background-color-default));border:none;border-bottom:1px solid var(--xy-controls-button-border-color-props,var(--xy-controls-button-border-color,var(--xy-controls-button-border-color-default)));width:26px;height:26px;color:var(--xy-controls-button-color-props,var(--xy-controls-button-color,var(--xy-controls-button-color-default)));cursor:pointer;-webkit-user-select:none;user-select:none;justify-content:center;align-items:center;padding:4px;display:flex}.react-flow__controls-button svg{fill:currentColor;width:100%;max-width:12px;max-height:12px}.react-flow__edge.updating .react-flow__edge-path{stroke:#777}.react-flow__edge-text{font-size:10px}.react-flow__node.selectable:focus,.react-flow__node.selectable:focus-visible{outline:none}.react-flow__node-input,.react-flow__node-default,.react-flow__node-output,.react-flow__node-group{border-radius:var(--xy-node-border-radius,var(--xy-node-border-radius-default));width:150px;color:var(--xy-node-color,var(--xy-node-color-default));text-align:center;border:var(--xy-node-border,var(--xy-node-border-default));background-color:var(--xy-node-background-color,var(--xy-node-background-color-default));padding:10px;font-size:12px}.react-flow__node-input.selectable:hover,.react-flow__node-default.selectable:hover,.react-flow__node-output.selectable:hover,.react-flow__node-group.selectable:hover{box-shadow:var(--xy-node-boxshadow-hover,var(--xy-node-boxshadow-hover-default))}.react-flow__node-input.selectable.selected,.react-flow__node-input.selectable:focus,.react-flow__node-input.selectable:focus-visible,.react-flow__node-default.selectable.selected,.react-flow__node-default.selectable:focus,.react-flow__node-default.selectable:focus-visible,.react-flow__node-output.selectable.selected,.react-flow__node-output.selectable:focus,.react-flow__node-output.selectable:focus-visible,.react-flow__node-group.selectable.selected,.react-flow__node-group.selectable:focus,.react-flow__node-group.selectable:focus-visible{box-shadow:var(--xy-node-boxshadow-selected,var(--xy-node-boxshadow-selected-default))}.react-flow__node-group{background-color:var(--xy-node-group-background-color,var(--xy-node-group-background-color-default))}.react-flow__nodesselection-rect,.react-flow__selection{background:var(--xy-selection-background-color,var(--xy-selection-background-color-default));border:var(--xy-selection-border,var(--xy-selection-border-default))}.react-flow__nodesselection-rect:focus,.react-flow__nodesselection-rect:focus-visible,.react-flow__selection:focus,.react-flow__selection:focus-visible{outline:none}.react-flow__controls-button:hover{background:var(--xy-controls-button-background-color-hover-props,var(--xy-controls-button-background-color-hover,var(--xy-controls-button-background-color-hover-default)));color:var(--xy-controls-button-color-hover-props,var(--xy-controls-button-color-hover,var(--xy-controls-button-color-hover-default)))}.react-flow__controls-button:disabled{pointer-events:none}.react-flow__controls-button:disabled svg{fill-opacity:.4}.react-flow__controls-button:last-child{border-bottom:none}.react-flow__controls.horizontal .react-flow__controls-button{border-bottom:none;border-right:1px solid var(--xy-controls-button-border-color-props,var(--xy-controls-button-border-color,var(--xy-controls-button-border-color-default)))}.react-flow__controls.horizontal .react-flow__controls-button:last-child{border-right:none}.react-flow__resize-control{position:absolute}.react-flow__resize-control.left,.react-flow__resize-control.right{cursor:ew-resize}.react-flow__resize-control.top,.react-flow__resize-control.bottom{cursor:ns-resize}.react-flow__resize-control.top.left,.react-flow__resize-control.bottom.right{cursor:nwse-resize}.react-flow__resize-control.bottom.left,.react-flow__resize-control.top.right{cursor:nesw-resize}.react-flow__resize-control.handle{background-color:var(--xy-resize-background-color,var(--xy-resize-background-color-default));border:1px solid #fff;border-radius:1px;width:5px;height:5px;translate:-50% -50%}.react-flow__resize-control.handle.left{top:50%;left:0}.react-flow__resize-control.handle.right{top:50%;left:100%}.react-flow__resize-control.handle.top{top:0;left:50%}.react-flow__resize-control.handle.bottom{top:100%;left:50%}.react-flow__resize-control.handle.top.left,.react-flow__resize-control.handle.bottom.left{left:0}.react-flow__resize-control.handle.top.right,.react-flow__resize-control.handle.bottom.right{left:100%}.react-flow__resize-control.line{border-color:var(--xy-resize-background-color,var(--xy-resize-background-color-default));border-style:solid;border-width:0}.react-flow__resize-control.line.left,.react-flow__resize-control.line.right{width:1px;height:100%;top:0;transform:translate(-50%)}.react-flow__resize-control.line.left{border-left-width:1px;left:0}.react-flow__resize-control.line.right{border-right-width:1px;left:100%}.react-flow__resize-control.line.top,.react-flow__resize-control.line.bottom{width:100%;height:1px;left:0;transform:translateY(-50%)}.react-flow__resize-control.line.top{border-top-width:1px;top:0}.react-flow__resize-control.line.bottom{border-bottom-width:1px;top:100%}.react-flow__edge-textbg{fill:var(--xy-edge-label-background-color,var(--xy-edge-label-background-color-default))}.react-flow__edge-text{fill:var(--xy-edge-label-color,var(--xy-edge-label-color-default))}:root{--lightningcss-light: ;--lightningcss-dark:initial;color-scheme:dark;--bg:#0f1115;--panel:#171a21;--line:#2a2f3a;--text:#e6e8ee;--muted:#9aa3b7;--accent:#7aa2f7;--warn:#e0af68;--l0:#7aa2f7;--l1:#9ece6a;--l2:#e0af68;--l3:#bb9af7;--l4:#7dcfff;--l5:#f7768e;--raised:#1a1e27;--raised-2:#151922;--row-bg:#12151b;--hover:#1d222c;--active:#243040;--chip-bg:#1c222e;--chip-line:#323b4d;--kind-bg:#242a36;--kind-decision-bg:#2b2440;--kind-decision-text:#c0a8ff;--kind-question-bg:#3a2f1d;--kind-message-bg:#23331d;--kind-message-text:#9ece6a;--missing:#a2abbf;--search-hit-bg:#2b2724;--search-active-bg:#373129;--diff-add-bg:#16301c;--diff-add-text:#b7f0c0;--diff-remove-bg:#3a1d23;--diff-remove-text:#ffc4cc;--on-lane:#0f1115;--translucent-panel:#14171ef7;--translucent-outline:#11141af0;--overlay:#05070a9e;--shadow:#00000080}@media (prefers-color-scheme:light){:root:not([data-theme=dark]){--lightningcss-light:initial;--lightningcss-dark: ;color-scheme:light;--bg:#fbfbfd;--panel:#f2f4f8;--line:#d5dae4;--text:#1b2230;--muted:#545e72;--accent:#2957c8;--warn:#8a5300;--l0:#2957c8;--l1:#2f7d32;--l2:#8a5300;--l3:#6f42c1;--l4:#0b6e99;--l5:#b3261e;--raised:#e9edf5;--raised-2:#eef1f7;--row-bg:#f4f6fa;--hover:#e6ebf5;--active:#d9e3f7;--chip-bg:#e8edf5;--chip-line:#c2cbdb;--kind-bg:#e4e8f0;--kind-decision-bg:#ece4ff;--kind-decision-text:#5b3aa8;--kind-question-bg:#fbf0dc;--kind-message-bg:#e7f3e1;--kind-message-text:#2a7430;--missing:#4f586b;--search-hit-bg:#e7e2dc;--search-active-bg:#e1d9cd;--diff-add-bg:#e2f5e4;--diff-add-text:#145c22;--diff-remove-bg:#fbe4e6;--diff-remove-text:#8a1c26;--on-lane:#fff;--translucent-panel:#fffffff7;--translucent-outline:#f6f8fbf5;--overlay:#141a2659;--shadow:#141e322e}}:root[data-theme=light]{--lightningcss-light:initial;--lightningcss-dark: ;color-scheme:light;--bg:#fbfbfd;--panel:#f2f4f8;--line:#d5dae4;--text:#1b2230;--muted:#545e72;--accent:#2957c8;--warn:#8a5300;--l0:#2957c8;--l1:#2f7d32;--l2:#8a5300;--l3:#6f42c1;--l4:#0b6e99;--l5:#b3261e;--raised:#e9edf5;--raised-2:#eef1f7;--row-bg:#f4f6fa;--hover:#e6ebf5;--active:#d9e3f7;--chip-bg:#e8edf5;--chip-line:#c2cbdb;--kind-bg:#e4e8f0;--kind-decision-bg:#ece4ff;--kind-decision-text:#5b3aa8;--kind-question-bg:#fbf0dc;--kind-message-bg:#e7f3e1;--kind-message-text:#2a7430;--missing:#4f586b;--search-hit-bg:#e7e2dc;--search-active-bg:#e1d9cd;--diff-add-bg:#e2f5e4;--diff-add-text:#145c22;--diff-remove-bg:#fbe4e6;--diff-remove-text:#8a1c26;--on-lane:#fff;--translucent-panel:#fffffff7;--translucent-outline:#f6f8fbf5;--overlay:#141a2659;--shadow:#141e322e}*{box-sizing:border-box}html,body,#root{height:100%}body:has(.map-page){overflow:hidden}body{background:var(--bg);color:var(--text);margin:0;font:15px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}main{padding:32px 24px 64px}main.panel-page{width:66.667%;margin-left:auto;margin-right:auto;padding-left:0;padding-right:0}.panel-page .page-bar{margin-bottom:20px}.brand{color:var(--text);letter-spacing:-.02em;flex-direction:column;flex:none;align-self:center;font-size:26px;font-weight:700;line-height:1.1;text-decoration:none;display:inline-flex}.brand-tagline{color:var(--muted);letter-spacing:0;font-size:13px;font-style:italic;font-weight:400}a.brand:hover .brand-tagline{color:var(--text)}.back-link{width:fit-content;color:var(--muted);margin-top:8px;font-size:13px;text-decoration:none;display:block}.back-link:hover{color:var(--text);text-decoration:underline}main.map-page{flex-direction:column;height:100%;padding:20px 0 16px;display:flex}.map-page .page-head,.map-page .lineage-map{width:66.667%;margin-left:auto;margin-right:auto}.map-page .page-head{flex:none}@media (width>=1101px){.map-page .lineage-map:has(.drilldown){width:auto;margin-left:16.667%;margin-right:24px}}.map-page .lineage-map{flex-direction:column;flex:auto;min-height:0;margin-top:8px;padding:0;display:flex;container-type:inline-size}@media (width<=1100px){main.map-page{padding-left:16px;padding-right:16px}.map-page .page-head,.map-page .lineage-map{width:100%}main.panel-page{width:100%;padding-left:16px;padding-right:16px}}.page-head{margin:0}.page-bar{justify-content:space-between;align-items:flex-start;gap:12px;display:flex}.page-bar-actions{flex:none;align-items:flex-start;gap:12px;display:flex}.page-bar-centered{grid-template-columns:1fr auto 1fr;align-items:center;display:grid}.page-bar-centered .page-bar-actions{justify-self:end;align-items:center}.page-title{text-align:center;min-width:0}.page-title h1{margin:0;font-size:26px;line-height:1.2}.page-title .muted{text-overflow:ellipsis;white-space:nowrap;margin:2px 0 0;font-size:11px;overflow:hidden}.theme-button{width:36px;height:36px;color:var(--text);background:var(--panel);border:1px solid var(--line);cursor:pointer;border-radius:8px;justify-content:center;align-items:center;padding:0;display:inline-flex}.theme-button:hover{background:var(--hover)}.project .switcher{margin-top:10px;margin-bottom:0}.map-search{flex:none;width:250px}.map-search-row{align-items:center;gap:6px;display:flex}.map-search-input{min-width:0;color:var(--text);font:inherit;background:var(--raised);border:1px solid var(--line);border-radius:7px;flex:auto;padding:5px 10px;font-size:13px}.map-search-input:focus{outline:1px solid var(--accent)}.map-search-count{color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap;flex:none;font-size:12px}.map-search-step{width:24px;height:26px;color:var(--muted);font:inherit;background:var(--raised);border:1px solid var(--line);cursor:pointer;border-radius:6px;flex:none;padding:0;font-size:12px}.map-search-step:hover:not(:disabled){color:var(--text);border-color:var(--accent)}.map-search-step:disabled{cursor:default;opacity:.4}.map-search-hint{color:var(--muted);text-align:right;text-overflow:ellipsis;white-space:nowrap;margin:4px 0 0;font-size:11px;overflow:hidden}.page-actions{flex-direction:column;align-items:flex-end;gap:8px;display:flex}.settings-button{color:var(--muted);font:inherit;background:var(--raised-2);border:1px solid var(--line);cursor:pointer;border-radius:8px;flex:none;margin-left:auto;padding:6px 12px;font-size:13px}.settings-button:hover{color:var(--text);border-color:var(--accent)}h1,h2,h3{margin:0 0 8px;line-height:1.25}h1{font-size:26px}h2{font-size:20px}h3{font-size:15px}p{margin:4px 0}ul{margin:6px 0;padding-left:20px}.switcher{margin-bottom:18px}.switcher-tabs{align-items:stretch;gap:6px;padding-bottom:2px;display:flex;overflow-x:auto}.switcher-tab{max-width:220px;color:var(--muted);background:var(--raised-2);border:1px solid var(--line);border-radius:8px;flex:none;align-items:baseline;gap:8px;padding:6px 12px;font-size:13px;text-decoration:none;display:flex}.switcher-tab:hover{color:var(--text);border-color:var(--chip-line)}.switcher-tab.is-current{color:var(--text);background:var(--active);border-color:var(--accent)}.switcher-name{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.switcher-time{color:var(--muted);white-space:nowrap;flex:none;font-size:11px}.switcher-more{color:var(--muted);font:inherit;border:1px dashed var(--line);cursor:pointer;background:0 0;border-radius:8px;flex:none;padding:5px 12px;font-size:13px}.switcher-more:hover{color:var(--text);border-color:var(--accent)}.switcher-more kbd{border:1px solid var(--line);border-radius:4px;padding:1px 4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px}.switcher-overlay{z-index:200;background:var(--overlay);justify-content:center;align-items:flex-start;padding:12vh 16px 32px;display:flex;position:fixed;inset:0}.switcher-dialog{background:var(--panel);border:1px solid var(--line);width:min(640px,100%);box-shadow:0 20px 60px var(--shadow);border-radius:12px;padding:12px}.switcher-input{width:100%;color:var(--text);font:inherit;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:9px 12px}.switcher-input:focus{outline:1px solid var(--accent)}.switcher-results{max-height:50vh;margin:8px 0 0;padding:0;list-style:none;overflow-y:auto}.switcher-result{cursor:pointer;border:1px solid #0000;border-radius:8px;padding:8px 10px}.switcher-result.is-active{background:var(--active);border-color:var(--accent)}.switcher-result-head{align-items:baseline;gap:8px;display:flex}.switcher-result-head .switcher-name{font-size:14px;font-weight:600}.switcher-result-head .switcher-time{margin-left:auto}.switcher-leftoff{-webkit-line-clamp:2;-webkit-box-orient:vertical;margin-top:2px;font-size:13px;display:-webkit-box;overflow:hidden}.switcher-path{color:var(--muted);text-overflow:ellipsis;white-space:nowrap;font-size:11px;display:block;overflow:hidden}.switcher-hint{color:var(--muted);margin:8px 2px 0;font-size:11px}.switcher-none{padding:8px 10px}.settings-overlay{z-index:250;background:var(--overlay);justify-content:center;align-items:flex-start;padding:10vh 16px 32px;display:flex;position:fixed;inset:0}.settings-dialog{background:var(--panel);border:1px solid var(--line);width:min(640px,100%);max-height:80vh;box-shadow:0 20px 60px var(--shadow);border-radius:12px;padding:18px 20px 22px;overflow:auto}.settings-head{justify-content:space-between;align-items:center;gap:12px;display:flex}.settings-close{width:28px;height:28px;color:var(--muted);font:inherit;border:1px solid var(--line);cursor:pointer;background:0 0;border-radius:8px;font-size:18px;line-height:1}.settings-close:hover{color:var(--text);border-color:var(--accent)}.settings-section{margin-top:16px}.settings-section h3{color:var(--muted);letter-spacing:.08em;text-transform:uppercase;font-size:12px}.settings-field{border-bottom:1px solid var(--line);justify-content:space-between;align-items:flex-start;gap:16px;padding:10px 0;display:flex}.settings-field:last-child{border-bottom:0}.settings-field-text{min-width:0}.settings-label{align-items:center;gap:6px;font-size:14px;display:inline-flex}.settings-why{box-sizing:border-box;width:18px;height:18px;color:var(--muted);background:var(--panel);border:1px solid var(--line);font:inherit;cursor:help;border-radius:50%;justify-content:center;align-items:center;padding:0;font-size:11px;line-height:1;display:inline-flex}.settings-why-wrap:hover .settings-why,.settings-why:focus-visible{color:var(--text);border-color:var(--muted)}.settings-why-wrap{display:inline-flex;position:relative}.settings-details{z-index:5;width:max-content;max-width:min(46ch,100vw - 64px);color:var(--text);background:var(--panel);border:1px solid var(--line);white-space:normal;border-radius:6px;padding:8px 10px;font-size:12px;font-weight:400;line-height:1.5;position:absolute;top:calc(100% + 6px);left:-8px;box-shadow:0 6px 20px #0000002e}.settings-help{color:var(--muted);margin:2px 0 0;font-size:12px}.settings-value{max-width:40%;color:var(--muted);text-align:right;flex:none;font-size:13px}.settings-field .setting-form{flex-wrap:wrap;flex:none;justify-content:flex-end;max-width:50%}.project{border-bottom:1px solid var(--line);justify-content:space-between;align-items:flex-end;gap:16px;padding-bottom:16px;display:flex}.meta{flex-direction:column;align-items:flex-end;gap:2px;font-size:13px;display:flex}.muted{color:var(--muted);font-size:13px;font-weight:400}.needs-user{color:var(--warn)}.badge{border:1px solid var(--warn);white-space:nowrap;border-radius:999px;margin-left:6px;padding:1px 6px;font-size:11px}.map-shell{flex-direction:column;flex:auto;min-height:0;display:flex}.map-toolbar{flex:none;justify-content:flex-end;align-items:center;gap:8px;margin-top:0;display:flex}.map-title{min-width:0;color:var(--muted);text-overflow:ellipsis;white-space:nowrap;margin-right:auto;font-size:13px;overflow:hidden}body:has(.map-shell.is-expanded){overflow:hidden}.map-shell.is-expanded{z-index:100;background:var(--bg);flex-direction:column;padding:12px;display:flex;position:fixed;inset:0}.map-shell.is-expanded .map-toolbar{margin-top:0}.map-shell.is-expanded .graph-wrap{flex:1;height:auto}.person-filter{color:var(--muted);background:var(--raised);border:1px solid var(--line);font:inherit;border-radius:7px;padding:4px 8px;font-size:13px}.session-row.is-dimmed,.session-rows.is-dimmed{opacity:.35}.outline-button{color:var(--muted);background:var(--raised);border:1px solid var(--line);font:inherit;cursor:pointer;border-radius:7px;padding:5px 12px;font-size:13px}.outline-button:hover,.outline-button[aria-pressed=true]{color:var(--text);border-color:var(--accent)}.graph-wrap{background:var(--row-bg);border:1px solid var(--line);border-radius:12px;flex:auto;min-height:0;margin-top:8px;display:flex;position:relative;overflow:hidden}.graph-canvas{flex:1;min-width:0;height:100%;position:relative}.graph-status{justify-content:center;align-items:center;height:100%;margin:0;padding:24px;display:flex}.outline{background:var(--translucent-outline);border-right:1px solid var(--line);flex-direction:column;flex:none;width:270px;height:100%;display:flex}.outline-head{border-bottom:1px solid var(--line);flex:none;align-items:center;gap:8px;padding:10px 10px 10px 14px;display:flex}.outline-title{text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-size:12px;font-weight:600}.outline-badge{color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:1px 6px;font-size:10px}.outline-head .drilldown-close{margin-left:auto}.outline-scroll{flex:1;padding:6px 6px 12px;overflow-y:auto}.outline-list,.outline-list ul{margin:0;padding:0;list-style:none}.outline-list ul{padding-left:14px}.outline-row{align-items:center;gap:2px;min-width:0;display:flex}.outline-toggle{width:18px;height:18px;color:var(--muted);cursor:pointer;background:0 0;border:0;flex:none;padding:0;font-size:11px;line-height:1}.outline-toggle:hover{color:var(--text)}.outline-toggle.is-empty{cursor:default;display:inline-block}.outline-item{min-width:0;color:var(--text);font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:5px;flex:1;align-items:center;gap:6px;padding:4px 6px;font-size:13px;display:flex;overflow:hidden}.outline-item:hover{background:var(--hover)}.outline-item.is-active{background:var(--active);outline:1px solid var(--accent)}.outline-item .label{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.outline-count{color:var(--muted);flex:none;margin-left:auto;font-size:11px}.files-view{width:330px}.file-row .file-path{font-family:var(--mono,ui-monospace, SFMono-Regular, Menlo, monospace);font-size:12px}.file-hits{margin:0 0 4px;padding:0 0 0 20px;list-style:none}.file-hit{width:100%;color:var(--text);font:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:5px;flex-direction:column;gap:2px;padding:5px 8px;font-size:12px;display:flex}.file-hit:hover{background:var(--hover)}.file-hit.is-active{background:var(--active);outline:1px solid var(--accent)}.file-hit-line{align-items:baseline;gap:6px;min-width:0;display:flex}.file-hit-time{color:var(--muted);font-variant-numeric:tabular-nums;flex:none;font-size:11px}.file-hash,.file-label{color:var(--muted);font-family:var(--mono,ui-monospace, SFMono-Regular, Menlo, monospace);flex:none;font-size:11px}.file-hit-title{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.file-hit-meta{color:var(--muted);white-space:nowrap;text-overflow:ellipsis;gap:6px;font-size:11px;display:flex;overflow:hidden}.file-hit-branch,.file-hit-commit{font-family:var(--mono,ui-monospace, SFMono-Regular, Menlo, monospace)}.map-node .git-graph{margin:0}.session-row{font-size:13px}.session-dot{cursor:pointer}.session-dot:hover{filter:brightness(1.3)}.session-count{text-overflow:ellipsis;white-space:nowrap;flex:0 auto;min-width:0;overflow:hidden}.session-author{text-overflow:ellipsis;white-space:nowrap;flex:0 auto;min-width:0;max-width:14ch;overflow:hidden}.left-off{color:var(--warn);border:1px solid var(--warn);border-radius:999px;margin-top:4px;padding:1px 6px;font-size:10px;line-height:14px;display:inline-block}.unsummarized{color:var(--muted);border:1px dashed var(--muted);border-radius:999px;margin-top:4px;padding:1px 6px;font-size:10px;line-height:14px;display:inline-block}.kind{text-transform:uppercase;letter-spacing:.04em;background:var(--kind-bg);color:var(--muted);border-radius:4px;flex:none;padding:1px 6px;font-size:10px}.kind.kind-decision{background:var(--kind-decision-bg);color:var(--kind-decision-text)}.kind.kind-question{background:var(--kind-question-bg);color:var(--warn)}.kind.kind-message{background:var(--kind-message-bg);color:var(--kind-message-text)}.empty,.error{color:var(--muted);font-style:italic}.drilldown{z-index:10;background:var(--translucent-panel);border-left:1px solid var(--line);flex-direction:column;flex:none;width:460px;display:flex}@media (width<=900px){.drilldown{border:1px solid var(--line);width:min(460px,100% - 24px);box-shadow:0 12px 32px var(--shadow);border-radius:10px;position:absolute;top:12px;bottom:12px;right:12px}}.drilldown-head{border-bottom:1px solid var(--line);justify-content:space-between;align-items:flex-start;gap:12px;padding:14px 16px;display:flex}.drilldown-head h2{overflow-wrap:anywhere;margin:6px 0 0;font-size:16px}.drilldown-close{width:28px;height:28px;color:var(--muted);background:var(--hover);border:1px solid var(--line);cursor:pointer;border-radius:6px;flex:none;padding:0;font-size:18px;line-height:1}.drilldown-close:hover{color:var(--text);border-color:var(--accent)}.drilldown-body{flex:1;padding:14px 16px;overflow-y:auto}.drilldown-body section{margin-bottom:14px}.drilldown-body h3{text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:4px;font-size:11px}.drilldown-body p{overflow-wrap:anywhere}.drilldown-body details.fold{margin-bottom:14px}.drilldown-body details.fold>summary{cursor:pointer;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:4px;font-size:11px}.drilldown-body details.fold>summary:hover{color:var(--text)}.drilldown-body .decided-by{color:var(--muted);margin:-8px 0 14px;font-size:12px}.drilldown-list{margin:4px 0 0;padding-left:18px}.drilldown-list li+li{margin-top:4px}h3 .count{color:var(--muted);background:var(--chip-bg);border-radius:8px;margin-left:4px;padding:0 6px;font-size:11px;font-weight:500}.commit-list,.file-list{border:1px solid var(--line);border-radius:6px;margin:6px 0 0;padding:0;list-style:none;overflow:hidden}.commit-item,.file-list li{background:var(--row-bg)}.commit-row{width:100%;color:inherit;font:inherit;text-align:left;background:0 0;border:0;flex-wrap:wrap;align-items:baseline;gap:6px;padding:7px 10px;font-size:13px;line-height:18px;display:flex}button.commit-row{cursor:pointer}button.commit-row:hover{background:var(--hover)}.commit-item+.commit-item,.file-list li+li{border-top:1px solid var(--line)}.commit-hash{color:var(--accent);background:var(--chip-bg);border:1px solid var(--chip-line);border-radius:4px;flex:none;padding:0 5px;font-size:11px}.commit-type{color:var(--on-lane);text-transform:uppercase;letter-spacing:.03em;background:var(--muted);border-radius:4px;flex:none;padding:0 6px;font-size:10px;font-weight:700;line-height:16px}.commit-scope{color:var(--muted);flex:none;font-size:12px}.commit-scope:before{content:"("}.commit-scope:after{content:")"}.commit-subject{flex:180px;min-width:0}.commit-item.is-missing .commit-hash{color:var(--missing);border-style:dashed}.commit-item.is-missing .commit-subject{color:var(--missing);font-style:italic}.file-row{width:100%;min-width:0;color:inherit;text-align:left;background:0 0;border:0;align-items:baseline;gap:8px;padding:5px 10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;display:flex}button.file-row{cursor:pointer}button.file-row:hover{background:var(--hover)}.file-name{color:var(--text);flex:none;font-weight:600}.file-dir{min-width:0;color:var(--muted);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.diff-caret{color:var(--muted);flex:none;margin-left:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}.diff-view{background:var(--raised-2);border-top:1px solid var(--line);padding:8px 10px 10px;overflow-x:hidden}.diff-toolbar{color:var(--muted);justify-content:flex-end;margin-bottom:6px;font-size:11px;display:flex}.diff-loading{margin:6px 0;padding:6px 10px;font-size:12px}.diff-patch+.diff-patch{border-top:1px solid var(--line);margin-top:8px;padding-top:8px}.diff-file{overflow-wrap:anywhere;margin-bottom:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;font-weight:600}.diff-meta{overflow-wrap:anywhere;color:var(--muted);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}.diff-hunk{overflow-wrap:anywhere;color:var(--muted);background:var(--chip-bg);border-radius:4px;margin:6px 0 2px;padding:2px 6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}.diff-row{align-items:baseline;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;line-height:16px;display:flex}.diff-no{width:34px;color:var(--muted);text-align:right;-webkit-user-select:none;user-select:none;flex:none;padding-right:4px}.diff-mark{text-align:center;flex:none;width:14px}.diff-text{white-space:pre-wrap;overflow-wrap:anywhere;flex:1;min-width:0}.diff-add{color:var(--diff-add-text);background:var(--diff-add-bg)}.diff-remove{color:var(--diff-remove-text);background:var(--diff-remove-bg)}.diff-context{color:var(--text)}.diff-note{color:var(--muted);font-style:italic}.diff-note-line{overflow-wrap:anywhere;color:var(--muted);padding:2px 6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;display:block}.diff-side-row{grid-template-columns:34px minmax(0,1fr) 34px minmax(0,1fr);display:grid}.diff-side-row .diff-note-line{grid-column:1/-1}.diff-side-no{width:auto;padding:0 4px}.diff-cell{white-space:pre-wrap;overflow-wrap:anywhere;min-width:0;padding:0 4px}.diff-cell.is-empty{background:var(--bg);opacity:.55}.drilldown-meta{gap:8px;margin:0 0 16px;display:grid}.drilldown-field{grid-template-columns:110px 1fr;gap:8px;font-size:13px;display:grid}.drilldown-field dt{color:var(--muted)}.drilldown-field dd{overflow-wrap:anywhere;margin:0}.drilldown-field code{overflow-wrap:anywhere;font-size:12px}.resume{border-top:1px solid var(--line);padding-top:12px}.resume-actions{flex-wrap:wrap;align-items:center;gap:6px;display:flex}.resume-button{color:var(--text);background:var(--active);border:1px solid var(--line);font:inherit;cursor:pointer;border-radius:7px;padding:2px 10px;font-size:12px}.resume-button:hover:not(:disabled){border-color:var(--accent)}.resume-button:disabled{color:var(--muted);cursor:not-allowed;opacity:.7}.resume-note{font-size:12px}.resume-command{background:var(--row-bg);border:1px solid var(--line);white-space:pre-wrap;overflow-wrap:anywhere;border-radius:6px;flex-basis:100%;margin:0;padding:6px 8px;font-size:12px;overflow-x:auto}time{color:var(--muted);font-size:12px}.inbox{margin:20px 0 8px}.inbox h2{margin:0;font-size:16px}.inbox-count{font-size:13px;font-weight:400}.inbox-rows{gap:8px;margin:10px 0 0;padding:0;list-style:none;display:grid}.inbox-row{background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:8px;flex-direction:column;gap:6px;padding:10px 12px;display:flex}.inbox-head{flex-wrap:wrap;align-items:baseline;gap:8px;display:flex}.inbox-project{font-weight:600}.inbox-session{color:var(--muted);font-size:13px}.inbox-age{color:var(--accent);border:1px solid var(--accent);white-space:nowrap;border-radius:999px;margin-left:auto;padding:1px 8px;font-size:12px}.inbox-age.is-record{color:var(--muted);border-color:var(--line)}.inbox-message{white-space:pre-wrap;-webkit-line-clamp:3;-webkit-box-orient:vertical;margin:0;font-size:13px;line-height:1.45;display:-webkit-box;overflow:hidden}.inbox-signal,.inbox-where{margin:0;font-size:12px}.inbox-where{color:var(--text)}.inbox-actions{flex-wrap:wrap;align-items:center;gap:10px;display:flex}.inbox-actions a{color:var(--accent)}.inbox-dismiss{width:24px;height:24px;color:var(--muted);cursor:pointer;background:0 0;border:1px solid #0000;border-radius:6px;padding:0;font-size:18px;line-height:22px}.inbox-dismiss:hover{color:var(--text);border-color:var(--line);background:var(--hover)}.inbox-toggle{color:inherit;font:inherit;cursor:pointer;background:0 0;border:0;padding:0}.inbox-caret{width:1em;color:var(--muted);display:inline-block}.inbox-error{margin:6px 0 0;font-size:12px}.panel-grid{grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;margin:24px 0 32px;padding:0;list-style:none;display:grid}.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;flex-direction:column;gap:8px;padding:16px;display:flex}.card.missing{border-color:var(--warn)}.card-head{align-items:center;gap:6px;display:flex}.card-head h2{font-size:17px}.card .path{overflow-wrap:anywhere}.card-facts,.settings dl{gap:4px;margin:0;display:grid}.card-facts div,.settings dl div{justify-content:space-between;gap:12px;display:flex}.card-facts dt,.settings dt{color:var(--muted);font-size:13px}.card-facts dd,.settings dd{margin:0;font-size:13px}.card a{color:var(--accent)}.card{position:relative}.card a.card-open:after{content:"";border-radius:10px;position:absolute;inset:0}.card:has(a.card-open):hover{border-color:var(--accent);cursor:pointer}.settings{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px}.settings h2{text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-size:12px}.settings dl{margin-top:10px}@media (width<=720px){.page-bar-centered{grid-template-columns:1fr auto}.page-bar-centered .page-title{text-align:left;grid-area:2/1/auto/-1}.project{flex-direction:column;align-items:flex-start}.meta,.page-actions{align-items:flex-start}.page-bar{flex-wrap:wrap}.settings-field{flex-direction:column;gap:6px}.settings-field .setting-form{justify-content:flex-start;max-width:none}.settings-value{text-align:left;max-width:none}.graph-wrap{flex-direction:column}.outline{border-right:0;border-bottom:1px solid var(--line);width:100%;height:180px}.graph-canvas{flex:1;height:auto;min-height:0}}.message-nav{justify-content:space-between;gap:8px;margin-bottom:14px;display:flex}.message-nav button,.chat-more{font:inherit;color:var(--text);background:var(--raised);border:1px solid var(--line);cursor:pointer;border-radius:6px;padding:4px 10px;font-size:12px}.message-nav button:hover:not(:disabled),.chat-more:hover{border-color:var(--accent)}.message-nav button:disabled{opacity:.4;cursor:default}.message-hash{align-items:center;gap:8px;margin:0 0 12px;font-size:13px;display:flex}.message-hash code{font-size:12px}.message-hash button{color:var(--text);background:var(--active);border:1px solid var(--line);font:inherit;cursor:pointer;border-radius:6px;padding:3px 8px;font-size:12px}.message-hash button:hover{border-color:var(--accent)}.chat-entry{border-left:3px solid var(--line);background:var(--raised);border-radius:8px;margin-top:8px;padding:8px 10px}.chat-user{border-left-color:var(--l1)}.chat-agent{border-left-color:var(--accent)}.chat-who{color:var(--muted);margin-bottom:4px;font-size:11px}.drilldown-body .chat-text{white-space:pre-wrap;font-size:13px;line-height:1.5}.chat-text+.chat-text{margin-top:8px}.drilldown-body .chat-tools{color:var(--muted);margin-top:6px;font-size:12px;font-style:italic}.git-graph{margin:0 0 24px 24px;position:relative}.git-lanes{position:absolute;top:0;left:0;overflow:visible}.git-rows{width:520px;position:absolute;top:0}.git-row{width:100%;color:var(--text);font:inherit;text-align:left;cursor:pointer;background:0 0;border:1px solid #0000;border-radius:5px;align-items:center;gap:8px;padding:0 8px;font-size:12px;display:flex;position:absolute;left:0;overflow:hidden}.git-row:hover{background:var(--hover)}.git-row.is-selected{background:var(--active);outline:1px solid var(--accent)}.git-row.is-search-hit{background:var(--search-hit-bg);box-shadow:inset 2px 0 0 var(--warn)}.git-row.is-search-active{background:var(--search-active-bg);outline:1px solid var(--warn)}.git-more{color:var(--muted);font-style:italic}.git-time{width:74px;color:var(--muted);text-overflow:ellipsis;white-space:nowrap;flex:none;font-size:11px;overflow:hidden}.git-id{color:var(--muted);opacity:.7;flex:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px}.git-title{overflow-wrap:anywhere;flex:auto;min-width:180px;line-height:16px}.git-tags{flex-wrap:wrap;flex:none;justify-content:flex-end;gap:4px;max-width:112px;display:flex}.git-tag{white-space:nowrap;color:var(--muted);background:var(--chip-bg);border:1px solid var(--chip-line);cursor:pointer;border-radius:3px;flex:none;padding:0 4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;line-height:15px}.git-tag:hover{color:var(--text);border-color:var(--accent)}.git-tag.is-missing{color:var(--missing);border-style:dashed}.git-continues{min-width:0;max-width:220px;color:var(--accent);text-overflow:ellipsis;white-space:nowrap;border:1px solid color-mix(in srgb, var(--accent) 45%, transparent);border-radius:4px;flex:0 auto;padding:1px 6px;font-size:11px;overflow:hidden}.git-continues:hover{background:color-mix(in srgb, var(--accent) 14%, transparent)}.git-row .left-off,.git-row .unsummarized{flex:none;margin:0}.branch-range{color:var(--muted);font-size:12px}.setting-form{align-items:center;gap:8px;display:flex}.setting-form input[type=text],.setting-form input[type=number],.setting-form select{width:150px;color:var(--text);background:var(--bg);border:1px solid var(--line);font:inherit;border-radius:6px;padding:3px 6px;font-size:13px}.setting-form input[type=checkbox]{margin:0}.settings-foot{background:var(--panel);border-top:1px solid var(--line);justify-content:flex-end;align-items:center;gap:12px;margin:8px -20px -22px;padding:12px 20px;display:flex;position:sticky;bottom:-22px}.settings-field.is-changed .settings-label:after{content:"\u2022";color:var(--accent,var(--text))}.settings-foot button,.setting-form button{color:var(--text);background:var(--panel);border:1px solid var(--line);font:inherit;cursor:pointer;border-radius:6px;padding:3px 10px;font-size:13px}.settings-foot button:disabled,.setting-form button:disabled{opacity:.45;cursor:default}.setting-status{color:var(--muted);font-size:12px}.setting-error{color:var(--l5);font-size:12px}.map-node button,.map-node .git-row,.row-edge,.session-dot,.git-dot-hit{pointer-events:all}.git-dot-hit{cursor:pointer}.map-node{position:relative}.session-open{position:absolute}.session-rows{position:relative}.row-edge{cursor:col-resize;touch-action:none;position:absolute;top:0}.row-edge:after{content:"";background:var(--line);width:1px;position:absolute;top:0;bottom:0;left:50%}.row-edge:hover:after,.row-edge.is-dragging:after{background:var(--accent);width:3px;margin-left:-1px}.session-toggle{width:10px;color:var(--muted);flex:none;font-size:10px}.session-row.is-open{background:color-mix(in srgb, var(--accent) 8%, transparent)}.git-change{white-space:nowrap;color:var(--muted);background:var(--chip-bg);border:1px solid var(--chip-line);border-radius:3px;flex:none;padding:0 4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;line-height:15px}.git-row.is-unread-big{box-shadow:inset 2px 0 0 color-mix(in srgb, var(--warn) 55%, transparent)}.git-change.is-big{color:var(--warn);border-color:color-mix(in srgb, var(--warn) 45%, transparent)}.unread-view .unread-row{flex-wrap:wrap;align-items:baseline;gap:6px;display:flex}.unread-view .unread-label{color:var(--muted);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}.unread-view .unread-title{text-overflow:ellipsis;white-space:nowrap;flex:140px;min-width:0;overflow:hidden}.unread-view .unread-session,.unread-view .unread-when{text-overflow:ellipsis;white-space:nowrap;flex:0 auto;font-size:10px;overflow:hidden}.unread-view .unread-row.is-big{box-shadow:inset 2px 0 0 color-mix(in srgb, var(--warn) 55%, transparent)}.read-toggle{color:var(--text);font:inherit;background:var(--chip-bg);border:1px solid var(--chip-line);cursor:pointer;border-radius:4px;padding:3px 10px;font-size:12px}.read-toggle[aria-pressed=true]{color:var(--muted);border-style:dashed}.shape-section{margin:14px 0}.shape-preview{max-height:8.5em;color:var(--text);white-space:pre-wrap;background:var(--chip-bg);border:1px solid var(--chip-line);border-radius:6px;margin:6px 0;padding:8px 10px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;overflow:hidden}.shape-preview-diagram{max-height:180px;margin:6px 0;overflow:hidden}.shape-open{color:var(--text);font:inherit;background:var(--chip-bg);border:1px solid var(--chip-line);cursor:pointer;border-radius:4px;padding:4px 12px;font-size:12px}.shape-overlay{z-index:40;background:color-mix(in srgb, var(--bg) 72%, transparent);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);justify-content:center;align-items:center;padding:4vh 4vw;display:flex;position:fixed;inset:0}.shape-modal{background:var(--panel);border:1px solid var(--line);width:min(980px,100%);max-height:92vh;box-shadow:0 24px 64px var(--shadow);border-radius:12px;outline:none;flex-direction:column;display:flex}.shape-head{border-bottom:1px solid var(--line);justify-content:space-between;align-items:flex-start;gap:12px;padding:18px 20px 10px;display:flex}.shape-head h2{margin:4px 0 0;font-size:17px;font-weight:600}.shape-layers{flex-direction:column;flex:1;min-height:0;display:flex}.shape-tabs{gap:4px;padding:10px 20px 0;display:flex}.shape-tab{color:var(--muted);font:inherit;cursor:pointer;background:0 0;border:1px solid #0000;border-radius:6px 6px 0 0;padding:7px 14px;font-size:13px}.shape-tab.is-active{color:var(--text);background:var(--chip-bg);border-color:var(--chip-line);border-bottom-color:#0000}.shape-tab-no{color:var(--muted);font-size:11px}.shape-layer{border-top:1px solid var(--chip-line);flex:1;min-height:0;padding:16px 20px 22px;overflow:auto}.shape-intent h4,.shape-code h4{letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin:12px 0 4px;font-size:12px}.shape-intent ul{margin:4px 0;padding-left:18px}.shape-table{border-collapse:collapse;width:100%;font-size:13px;line-height:1.5}.shape-table th,.shape-table td{text-align:left;vertical-align:top;border:1px solid var(--chip-line);padding:7px 10px}.shape-table thead th{color:var(--muted);letter-spacing:.04em;text-transform:uppercase;background:var(--chip-bg);font-size:11px;font-weight:600}.shape-table tbody th{width:26%;font-weight:600}.shape-figure{margin:0 0 16px}.shape-figure figcaption{color:var(--muted);margin-top:6px;font-size:11px}.shape-source{color:var(--text);white-space:pre-wrap;background:var(--chip-bg);border:1px solid var(--chip-line);border-radius:6px;margin:0;padding:12px 14px;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;overflow:auto}.shape-note{color:var(--muted);margin:6px 2px 0;font-size:12px}.shape-diagram{background:var(--chip-bg);border:1px solid var(--chip-line);border-radius:6px;padding:10px;overflow:auto}.shape-diagram svg{max-width:100%;height:auto;margin:0 auto;display:block}.shape-by{color:var(--muted);font-size:11px}.shape-code section{margin-bottom:14px}.shape-code h4 code{font-size:12px}\n/*$vite$:1*/</style>\n  </head>\n  <body>\n    <div id="root"></div>\n    <!-- `cogit build` replaces the empty element with the JSON view model. -->\n    <script id="cogit-data" type="application/json"></script>\n  </body>\n</html>\n';

// src/view/template.ts
var TEMPLATE_HTML = dist_default;

// src/view/panel.ts
var PANEL_TITLE = "<title>cogit \u2014 panel</title>";
function panelSettings(config) {
  return {
    recorder: config.recorder,
    language: config.language,
    updateEveryTurns: config.updateEveryTurns,
    sideEveryTurns: config.sideEveryTurns,
    sessionEndCatchUp: config.sessionEndCatchUp,
    sideModel: config.sideModel,
    messageSummaries: config.messageSummaries,
    startupContext: config.startupContext,
    recordHeadless: config.recordHeadless,
    tryBeforeNotes: config.tryBeforeNotes,
    shapes: config.shapes,
    shareConversations: config.shareConversations,
    recordCommit: config.recordCommit,
    gitPolicy: config.gitPolicy,
    agents: config.agents,
    bigChangeLines: config.bigChangeLines
  };
}
async function unreadBigCount(root, sessions, threshold) {
  try {
    const trailers = await readThoughtTrailers(root, {
      since: earliestSessionStart(sessions)
    });
    const withThoughts = attachThoughtTrailers(sessions, trailers);
    const hashes = new Set(
      withThoughts.flatMap((session) => session.nodes.flatMap((node) => node.commits ?? []))
    );
    if (hashes.size === 0) return 0;
    const changes = await readProjectChanges(root, hashes);
    const read = await readReadState(root);
    return countBigUnread(
      withThoughts.map((session) => ({
        sessionId: session.sessionId,
        title: session.title,
        startedAt: session.startedAt,
        nodes: session.nodes
      })),
      read,
      threshold
    );
  } catch {
    return 0;
  }
}
function lastMessageTitle(session) {
  const messages = session.nodes.filter((node) => node.kind === "message");
  return messages[messages.length - 1]?.title ?? "";
}
function leftOffLine(sessions) {
  const newest = [...sessions].sort(
    (a, b) => lastActive(b) - lastActive(a) || a.sessionId.localeCompare(b.sessionId)
  )[0];
  if (!newest) return "";
  return newest.status.next.trim() || lastMessageTitle(newest);
}
function newestMessageId(session) {
  for (let index = session.nodes.length - 1; index >= 0; index -= 1) {
    const node = session.nodes[index];
    if (node?.kind === "message") return node.id;
  }
  return null;
}
function lastDecisionOf(session) {
  let found = "";
  for (const node of session.nodes) {
    if (node.kind === "decision") found = node.title;
    else {
      const latest = node.agentDecisions?.at(-1);
      if (latest !== void 0) found = latest.title;
    }
  }
  return found;
}
function activityIso(session) {
  const time2 = lastActive(session);
  return Number.isFinite(time2) ? new Date(time2).toISOString() : null;
}
function openPending(session) {
  return session.status.pending.slice(0, INBOX_PENDING_LIMIT).map((item) => ({ text: item.text, needsUser: item.needsUser }));
}
async function collectInboxForProject(project, sessions, transcripts, config, now) {
  const agent3 = defaultAgent();
  const cutoff = Date.parse(now) - config.inboxMaxAgeDays * 24 * 60 * 60 * 1e3;
  const candidates = [];
  for (const session of sessions) {
    const activity = lastActive(session);
    if (!Number.isNaN(cutoff) && activity < cutoff - 24 * 60 * 60 * 1e3) continue;
    const file = transcripts.get(session.sessionId);
    let turn = null;
    if (file !== void 0) {
      try {
        const last = await agent3.readLastTurn(file);
        if (last?.speaker === "agent") turn = { at: last.at, text: last.text };
      } catch {
      }
    }
    const needsUser = session.status.pending.filter((item) => item.needsUser).map((item) => item.text);
    if (turn === null && needsUser.length === 0) continue;
    candidates.push({
      projectName: project.name,
      projectPath: project.path,
      mapUrl: pathToFileURL(projectPaths(project.path).html).href,
      sessionId: session.sessionId,
      sessionTitle: sessionTitle(session) || session.sessionId,
      turn,
      lastActivity: activityIso(session),
      needsUser,
      goal: session.status.goal.trim(),
      lastDecision: lastDecisionOf(session),
      pending: openPending(session),
      messageId: newestMessageId(session),
      transcriptAvailable: file !== void 0
    });
  }
  const dismissed = new Map(
    [...await readInboxDismissed(project.path)].map(([id, at]) => [
      dismissKey(project.path, id),
      at
    ])
  );
  return inboxRows(candidates, dismissed, now, config.inboxMaxAgeDays);
}
async function collectPanelData(entries, env, generatedAt, warn, quietPath) {
  const config = await loadConfig(env);
  const transcripts = await defaultAgent().collectTranscripts(env);
  const projects = [];
  const inbox = [];
  for (const entry of entries) {
    if (!await isDirectory(entry.path)) {
      projects.push({
        name: entry.name,
        path: entry.path,
        missing: true,
        lastActivity: null,
        needsUserCount: 0,
        lineageUrl: null,
        leftOff: "",
        unreadBigCount: 0
      });
      continue;
    }
    try {
      const sessionWarn = entry.path === quietPath ? () => {
      } : warn;
      const sessions = await loadAllSessions(entry.path, sessionWarn);
      const card = statusCard(sessions, generatedAt);
      const rows = await collectInboxForProject(
        { name: entry.name, path: entry.path },
        sessions,
        transcripts,
        config,
        generatedAt
      );
      projects.push({
        name: entry.name,
        path: entry.path,
        missing: false,
        lastActivity: card.lastActivity,
        needsUserCount: card.pending.filter((item) => item.needsUser).length,
        lineageUrl: pathToFileURL(projectPaths(entry.path).html).href,
        leftOff: leftOffLine(sessions),
        unreadBigCount: await unreadBigCount(entry.path, sessions, config.bigChangeLines)
      });
      inbox.push(...rows);
    } catch (err) {
      warn(`skipping project ${entry.path}: ${err.message}`);
      projects.push({
        name: entry.name,
        path: entry.path,
        missing: false,
        lastActivity: null,
        needsUserCount: 0,
        lineageUrl: pathToFileURL(projectPaths(entry.path).html).href,
        leftOff: "",
        unreadBigCount: 0
      });
    }
  }
  inbox.sort(compareInboxRows);
  return { projects, inbox };
}
async function collectRegistryData(env, generatedAt, warn, quietPath) {
  const registry = await loadRegistry(env);
  if (registry.found && !registry.ok) {
    warn(`registry: ${registry.error}; showing no projects`);
    return { projects: [], inbox: [] };
  }
  if (registry.found) {
    for (const warning of registry.warnings) warn(warning);
  }
  if (!registry.found || !registry.ok) return { projects: [], inbox: [] };
  return await collectPanelData(registry.data.projects, env, generatedAt, warn, quietPath);
}
async function buildPanel(opts) {
  const { io } = opts;
  const generatedAt = io.now();
  const config = await loadConfig(opts.env);
  const data = opts.data ?? await collectRegistryData(opts.env, generatedAt, io.warn, opts.quietPath);
  const model = {
    kind: "panel",
    schema: VIEW_SCHEMA,
    generatedAt,
    settings: panelSettings(config),
    // `leftOff` belongs to the map's switcher; the panel page stays as it was.
    projects: data.projects.map(({ leftOff: _leftOff, ...project }) => project),
    // Oldest first: the row that has waited longest is the one to go back to.
    inbox: data.inbox
  };
  const redacted = redactDeep(model);
  if (redacted.count > 0)
    io.warn(`redacted ${redacted.count} secret-looking value(s) in the panel`);
  const template = (opts.templateHtml ?? TEMPLATE_HTML).replace(
    /<title>[^<]*<\/title>/,
    PANEL_TITLE
  );
  await atomicWrite(globalPaths(opts.env).panel, embedViewModel(template, redacted.value));
  return redacted.value;
}

// src/view/switcher.ts
import { resolve } from "path";
function switcherEntries(projects, currentPath) {
  const current = resolve(currentPath);
  return projects.filter((project) => !project.missing && project.lineageUrl !== null).map((project) => ({
    name: project.name,
    path: project.path,
    lastActivity: project.lastActivity,
    leftOff: project.leftOff,
    lineageUrl: project.lineageUrl,
    current: resolve(project.path) === current
  })).sort((a, b) => {
    const byTime = time(b.lastActivity) - time(a.lastActivity);
    if (byTime > 0) return 1;
    if (byTime < 0) return -1;
    return a.name.localeCompare(b.name) || a.path.localeCompare(b.path);
  });
}
function time(value) {
  if (value === null) return Number.NEGATIVE_INFINITY;
  const at = Date.parse(value);
  return Number.isNaN(at) ? Number.NEGATIVE_INFINITY : at;
}

// src/commands/build.ts
var PENDING_TITLE_LENGTH = 200;
function toViewTurn(turn) {
  return {
    id: turn.hash ?? turn.id,
    ...turn.label === void 0 ? {} : { label: turn.label },
    at: turn.at,
    text: turn.text,
    replies: turn.replies,
    tools: turn.tools
  };
}
async function unrecordedSessions(root, sessions, transcripts) {
  const dir = dirname(projectPaths(root).state("x"));
  let names;
  try {
    names = await readdir2(dir);
  } catch {
    return [];
  }
  const known = new Set(sessions.map((session) => session.sessionId));
  const found = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const id = name.slice(0, -".json".length);
    if (known.has(id) || !transcripts.has(id) || !Slug.safeParse(id).success) continue;
    const info = await stat2(resolve2(dir, name)).catch(() => void 0);
    if (!info) continue;
    const startedAt = (info.birthtimeMs > 0 ? info.birthtime : info.mtime).toISOString();
    found.push({
      schema: SESSION_SCHEMA,
      sessionId: id,
      agent: "claude-code",
      title: "",
      startedAt,
      updatedAt: info.mtime.toISOString(),
      status: { goal: "", done: [], pending: [], next: "" },
      nodes: []
    });
  }
  return found;
}
async function readTranscriptViews(sessions, transcripts, root, io) {
  const agent3 = defaultAgent();
  const chats = /* @__PURE__ */ new Map();
  const pending = /* @__PURE__ */ new Map();
  const prepared = [];
  const unrecorded = /* @__PURE__ */ new Map();
  for (const session of sessions) {
    const file = transcripts.get(session.sessionId);
    const recordsMessages = session.nodes.some((node) => node.kind === "message");
    const roots = [session.worktree?.path, root].filter((r) => Boolean(r));
    const stored = await readConversationStore(root, session.sessionId);
    const storedByUuid = new Map(stored.map((turn) => [turn.uuid, turn]));
    let transcript = null;
    if (file) {
      try {
        transcript = await agent3.readConversation(file);
      } catch (err) {
        if (recordsMessages)
          io.warn(
            `could not read the conversation of ${session.sessionId}: ${err.message}`
          );
      }
    }
    const fromTranscript = transcript && transcript.length > 0 ? hashTurns(session.sessionId, transcript) : null;
    if (fromTranscript) {
      const fresh = fromTranscript.filter(
        (turn) => turn.uuid !== void 0 && !storedByUuid.has(turn.uuid)
      );
      const hashes = new Map(
        fromTranscript.flatMap(
          (turn) => turn.uuid === void 0 ? [] : [[turn.uuid, turn.hash]]
        )
      );
      try {
        if (fresh.length > 0)
          await appendConversationTurns(
            root,
            session.sessionId,
            fresh.map((turn) => agent3.displayTurn(turn, roots))
          );
        await appendConversationHashes(root, session.sessionId, hashes);
      } catch (err) {
        io.warn(
          `could not store the conversation of ${session.sessionId}: ${err.message}`
        );
      }
    }
    const messages = fromTranscript ? fromTranscript : stored.length > 0 ? storedMessages(session.sessionId, stored) : transcript ? [] : null;
    const upgraded = messages ? upgradeSessionIds(session, messages) : session;
    const events = await readEvents(root, session.sessionId);
    const effective = {
      ...upgraded,
      nodes: applyEvents(upgraded.nodes, events)
    };
    prepared.push(effective);
    let turns;
    if (fromTranscript) {
      turns = fromTranscript.map((turn) => {
        const kept = turn.uuid === void 0 ? void 0 : storedByUuid.get(turn.uuid);
        return kept ? toViewTurn({
          ...turn,
          at: kept.at,
          text: kept.text,
          replies: kept.replies,
          tools: kept.tools
        }) : toViewTurn(agent3.displayTurn(turn, roots));
      });
    } else if (stored.length > 0) {
      turns = (messages ?? []).map((message) => toViewTurn(message));
    } else {
      turns = [];
    }
    const recorded = new Set(effective.nodes.map((node) => node.id));
    const missing = (messages ?? []).filter((message) => !isRecorded(recorded, message));
    if (missing.length > 0) {
      pending.set(
        session.sessionId,
        missing.map((message) => ({
          id: message.hash,
          label: message.label,
          at: message.at,
          title: agent3.excerpt(message.text, PENDING_TITLE_LENGTH) || "(blank message)"
        }))
      );
      unrecorded.set(session.sessionId, missing.length);
    }
    if (recordsMessages || missing.length > 0) chats.set(session.sessionId, turns);
  }
  return { chats, pending, sessions: prepared, unrecorded };
}
async function commitInfo(root, sessions) {
  const hashes = /* @__PURE__ */ new Set();
  for (const session of sessions) {
    for (const node of session.nodes) {
      for (const hash of node.commits ?? []) hashes.add(hash);
    }
  }
  if (hashes.size === 0) return { subjects: /* @__PURE__ */ new Map(), files: /* @__PURE__ */ new Map(), changes: /* @__PURE__ */ new Map() };
  const gitRoot = await findGitRoot(root);
  if (gitRoot === void 0) return { subjects: /* @__PURE__ */ new Map(), files: /* @__PURE__ */ new Map(), changes: /* @__PURE__ */ new Map() };
  const [subjects, files, changes] = await Promise.all([
    readCommitSubjects(gitRoot, hashes),
    readCommitFiles(gitRoot, hashes),
    readProjectChanges(root, hashes)
  ]);
  return { subjects, files: projectFiles(gitRoot, root, files), changes };
}
async function buildProject(opts) {
  const { io } = opts;
  const { root } = await resolveProjectRoot(opts.dir);
  const project = await loadProject(root);
  if (!project.found) throw new CliError(`${root} is not initialized; run \`cogit init\` first`);
  if (!project.ok) throw new CliError(project.error);
  for (const warning of project.warnings) io.warn(warning);
  const paths = projectPaths(root);
  const config = await loadConfig(io.env);
  try {
    await refreshCogitGitignore(root, config.shareConversations);
  } catch (err) {
    io.warn(`could not update .cogit/.gitignore: ${err.message}`);
  }
  const generatedAt = io.now();
  let panelData = { projects: [], inbox: [] };
  try {
    panelData = await collectRegistryData(io.env, generatedAt, io.warn, root);
  } catch (err) {
    io.warn(`could not read the project list: ${err.message}`);
  }
  const switcher = switcherEntries(panelData.projects, root);
  const model = await withLock(
    paths.lock("build"),
    async () => {
      const recorded = await loadAllSessions(root, io.warn);
      const transcripts = await defaultAgent().collectTranscripts(io.env);
      const sessions = [...recorded, ...await unrecordedSessions(root, recorded, transcripts)];
      const views = await readTranscriptViews(sessions, transcripts, root, io);
      const trailers = await readThoughtTrailers(root, {
        env: io.env,
        since: earliestSessionStart(views.sessions)
      });
      const withThoughts = attachThoughtTrailers(views.sessions, trailers);
      const commits = await commitInfo(root, withThoughts);
      const withChanges = attachChanges(withThoughts, commits.changes);
      const read = await readReadState(root);
      const built = buildViewModel({
        project: project.data,
        sessions: withChanges,
        path: root,
        generatedAt,
        transcripts: new Set(transcripts.keys()),
        chats: views.chats,
        pending: views.pending,
        commitSubjects: commits.subjects,
        commitFiles: commits.files,
        // Over `file://` the settings modal shows these; a server page reads the
        // live values instead, so a map built before a change still agrees.
        settings: panelSettings(config),
        viewer: await sessionIdentity(root, io.env),
        // With the catch-up on, the hook records the tail at session end, so the
        // count would only be a stale warning about work already scheduled.
        unrecorded: config.sessionEndCatchUp ? void 0 : views.unrecorded
      });
      built.switcher = switcher;
      built.read = [...read].sort();
      const view = await readMapView(root);
      built.rowWidths = view.rowWidths;
      built.openSessions = view.open;
      const registered = panelData.projects.some(
        (candidate) => resolve2(candidate.path) === resolve2(root)
      );
      built.inbox = registered ? panelData.inbox.filter((row) => resolve2(row.projectPath) === resolve2(root)) : await collectInboxForProject(
        { name: project.data.name, path: root },
        views.sessions,
        transcripts,
        config,
        generatedAt
      );
      built.files = buildFileHistory(modelSessions(built), commits.files);
      const redacted = redactDeep(built);
      if (redacted.count > 0)
        io.warn(`redacted ${redacted.count} secret-looking value(s) in the map`);
      const template = opts.templateHtml ?? TEMPLATE_HTML;
      await atomicWrite(
        paths.html,
        markBuiltBy(embedViewModel(template, redacted.value), package_default.version)
      );
      if (!opts.quiet) io.out(`Wrote ${paths.html}`);
      return redacted.value;
    },
    { timeoutMs: 3e4 }
  );
  try {
    await buildPanel({
      env: io.env,
      io,
      templateHtml: opts.templateHtml ?? TEMPLATE_HTML,
      data: panelData
    });
  } catch (err) {
    io.warn(`could not build panel.html: ${err.message}`);
  }
  return model;
}

// src/commands/session.ts
var agent = defaultAgent();
async function readStdin(stream = process.stdin) {
  const chunks = [];
  for await (const c of stream) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks).toString("utf8");
}
async function sessionWrite(opts, io, stdin = readStdin) {
  const { root, worktree } = await resolveProjectRoot(opts.dir);
  const project = await loadProject(root);
  if (!project.found) throw new CliError(`${root} is not initialized; run \`cogit init\` first`);
  if (!project.ok) throw new CliError(project.error);
  const text = opts.file ? await readFile2(opts.file, "utf8") : await stdin();
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new CliError(`input is not valid JSON: ${err.message}`);
  }
  const parsed2 = SessionInput.safeParse(raw);
  if (!parsed2.success) {
    const issues = parsed2.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new CliError(`input does not match the session schema: ${issues.join("; ")}`);
  }
  const { value: redacted, count } = redactDeep(parsed2.data);
  const config = await loadConfig(io.env);
  const stamped = stampShapes(redacted, opts.by ?? "agent", io.now(), config.shapes, io);
  const messages = await readSessionMessages(root, redacted.sessionId, io.env);
  const input = withForkParent(
    nameMessages(stamped, messages, io, opts.by === "side"),
    messages,
    await forkParent(redacted.sessionId, io.env)
  );
  if (count > 0) io.warn(`redacted ${count} secret-looking value(s)`);
  const current = await loadSession(root, input.sessionId);
  const startedAt = current.found && current.ok ? current.data.startedAt : io.now();
  const identity = stampedIdentity(
    current.found && current.ok ? current.data : void 0,
    await sessionIdentity(root, io.env)
  );
  const crossTargets = await crossSessionTargets(
    root,
    input.sessionId,
    startedAt,
    input,
    io.env,
    identity
  );
  let warnings = [];
  const saved = await updateSession(root, input.sessionId, async (cur) => {
    const upgraded = cur && messages ? upgradeSessionIds(cur, messages) : cur;
    const events = await readEvents(root, input.sessionId);
    const base = upgraded ? { ...upgraded, nodes: applyEvents(upgraded.nodes, events) } : void 0;
    const by = opts.by ?? "agent";
    const merged = mergeSession(base, input, io.now(), {
      ...messages ? { order: messageOrder(messages) } : {},
      labels: hashesToLabels(messages),
      crossTargets,
      by,
      sideOwnsParent: sideOwnedParents(events, base?.nodes)
    });
    warnings = merged.warnings;
    const changes = structureChanges(merged.session, base, io.now(), by);
    const seed = events.length === 0 && changes.length > 0 && base?.nodes.some((n) => n.kind === "message") ? seedEvents(base.nodes, io.now()) : [];
    await appendEvents(root, input.sessionId, [...seed, ...changes]);
    const stored = worktree ? { ...merged.session, worktree } : merged.session;
    const stamped2 = { ...stored, lastRecordedBy: by };
    return { ...stamped2, ...stampedIdentity(stamped2, identity) };
  });
  for (const w of warnings) io.warn(w);
  if (opts.file && opts.consume) await rm2(opts.file, { force: true });
  io.out(`Saved session ${saved.sessionId} (${saved.nodes.length} nodes)`);
  try {
    await buildProject({ dir: root, io, quiet: true });
  } catch (err) {
    io.warn(`could not build map.html: ${err.message}`);
  }
  if (config.shapes && config.recorder !== "agent")
    await drainShapeQueue(root, saved, io.env, currentCliPath()).catch(() => 0);
}
function stampShapes(input, by, at, enabled, io) {
  if (!input.nodes?.some((node) => node.shape !== void 0)) return input;
  let warnedOff = false;
  const nodes = input.nodes.map((node) => {
    if (node.shape === void 0) return node;
    if (!enabled) {
      if (!warnedOff) {
        io.warn("shapes are off; the shape was not recorded");
        warnedOff = true;
      }
      const { shape: _dropped, ...rest } = node;
      return rest;
    }
    const shape = stampShape(node.shape, by, at);
    for (const tool of shape.tools) {
      if (tool.valid === false)
        io.warn(`shape ${tool.kind}: the output does not match the tool's format; kept as text`);
    }
    return { ...node, shape };
  });
  return { ...input, nodes };
}
function nameMessages(input, messages, io, dropUnknown = false) {
  const nodes = input.nodes ?? [];
  if (!nodes.some((n) => n.kind === "message")) return input;
  const byLabel = labelsToHashes(messages);
  const byHash = new Map((messages ?? []).map((message) => [message.hash, message]));
  const rename = (id) => byLabel.get(id) ?? id;
  const ref = (id) => {
    const own = parseMessageRef(id);
    return rename(own.sessionId === input.sessionId ? own.id : id);
  };
  const known = (node) => node.kind !== "message" || !messages || byHash.has(rename(node.id));
  for (const node of nodes) {
    if (dropUnknown && !known(node))
      io.warn(`message node ${node.id}: no such message in the transcript; not recorded`);
  }
  return {
    ...input,
    nodes: (dropUnknown ? nodes.filter(known) : nodes).map((node) => {
      if (node.kind !== "message") return node;
      const at = byHash.get(rename(node.id))?.at;
      if (!messages) {
        if (!MESSAGE_ID.test(node.id))
          io.warn(`message node ${node.id}: expected an id like m1 from \`session show\``);
      } else if (at === void 0) {
        io.warn(`message node ${node.id}: no such message in the transcript`);
      }
      return {
        ...node,
        id: rename(node.id),
        ...at === void 0 ? {} : { at },
        ...node.parent === void 0 || node.parent === null ? {} : { parent: ref(node.parent) },
        ...node.links === void 0 ? {} : { links: node.links.map(ref) }
      };
    })
  };
}
async function forkParent(sessionId, env = process.env) {
  const agent3 = defaultAgent();
  const file = await agent3.findTranscript(sessionId, env);
  if (!file) return null;
  const origin = await agent3.readForkOrigin(file).catch(() => null);
  return origin ? `${origin.sessionId}:${messageHash(origin.sessionId, origin.last)}` : null;
}
function withForkParent(input, messages, parent) {
  const first = messages?.[0];
  if (parent === null || first === void 0 || !input.nodes) return input;
  return {
    ...input,
    nodes: input.nodes.map(
      (node) => node.id === first.hash && typeof node.parent !== "string" ? { ...node, parent } : node
    )
  };
}
async function crossSessionTargets(root, sessionId, startedAt, input, env = process.env, author = {}) {
  const refs = /* @__PURE__ */ new Set();
  for (const node of input.nodes ?? []) {
    for (const value of [node.parent, ...node.links ?? []]) {
      if (typeof value === "string" && parseMessageRef(value).sessionId !== null) refs.add(value);
    }
  }
  const valid = /* @__PURE__ */ new Set();
  for (const value of refs) {
    const { sessionId: otherId, id } = parseMessageRef(value);
    if (otherId === null || otherId === sessionId) continue;
    const loaded = await loadSession(root, otherId);
    if (!loaded.found || !loaded.ok || !sameAuthor(loaded.data, author)) continue;
    const otherStart = Date.parse(loaded.data.startedAt);
    if (Number.isNaN(otherStart) || otherStart > Date.parse(startedAt)) continue;
    const messages = await readSessionMessages(root, otherId, env);
    const record = await effectiveRecord(root, otherId, loaded, messages);
    if (record?.nodes.some((node) => node.kind === "message" && node.id === id)) valid.add(value);
  }
  return valid;
}
function structureChanges(merged, before, at, by = "agent") {
  const previous = new Map(
    (before?.nodes ?? []).filter((node) => node.kind === "message").map((node) => [node.id, { parent: node.parent ?? null, links: node.links ?? [] }])
  );
  const events = [];
  for (const node of merged.nodes) {
    if (node.kind !== "message") continue;
    const old = previous.get(node.id) ?? { parent: null, links: [] };
    const parent = node.parent ?? null;
    if (parent !== old.parent)
      events.push({ at, type: "parent", msg: node.id, target: parent, by });
    const links = node.links ?? [];
    for (const link of links) {
      if (!old.links.includes(link))
        events.push({ at, type: "link", msg: node.id, target: link, by });
    }
    for (const link of old.links) {
      if (!links.includes(link))
        events.push({ at, type: "unlink", msg: node.id, target: link, by });
    }
  }
  return events;
}
async function sessionShow(dir, sessionId, io, opts = {}) {
  if (!Slug.safeParse(sessionId).success) throw new CliError(`invalid session id: ${sessionId}`);
  const given = resolve3(dir);
  const { root } = await resolveProjectRoot(given);
  const store = root === given ? {} : { store: root };
  const project = await loadProject(root);
  if (!project.found || !project.ok) {
    const error = project.found && !project.ok ? project.error : void 0;
    io.out(
      JSON.stringify({ initialized: false, dir: given, ...store, ...error ? { error } : {} })
    );
    return;
  }
  const config = await loadConfig(io.env);
  const loaded = await loadSession(root, sessionId);
  const view = {
    initialized: true,
    dir: given,
    ...store,
    project: project.data.name,
    language: config.language,
    messageSummaries: config.messageSummaries,
    session: null
  };
  const messages = await readSessionMessages(root, sessionId, io.env);
  const labels = hashesToLabels(messages);
  const effective = await effectiveRecord(root, sessionId, loaded, messages);
  if (effective) {
    const { title, status, nodes } = effective;
    view.session = {
      sessionId,
      title,
      status,
      nodes: nodes.map(({ id, parent, kind, title: title2 }) => {
        const label = labels.get(id);
        return { id, ...label === void 0 ? {} : { label }, parent, kind, title: title2 };
      })
    };
  } else if (loaded.found && !loaded.ok) {
    view.sessionError = loaded.error;
  }
  const recorded = recordedIdsOf(effective);
  if (messages) {
    view.messageCount = messages.length;
    view.newMessages = await newMessages(messages, recorded, labels, root, io.env);
    const first = messages[0];
    const unrecorded = first !== void 0 && (opts.full === true || !isRecorded(recorded, first));
    const forkedFrom = unrecorded ? await forkParent(sessionId, io.env) : null;
    if (forkedFrom !== null) view.forkedFrom = forkedFrom;
    const candidates = unrecorded && first !== void 0 && forkedFrom === null ? await parentCandidates(root, sessionId, first, io) : null;
    if (candidates) view.candidates = candidates;
  } else {
    view.newMessages = null;
  }
  view.lastMessages = lastMessages(
    effective,
    labels,
    opts.full === true ? Number.POSITIVE_INFINITY : LAST_MESSAGES
  );
  if (messages && messages.length === 0) {
    const file = await agent.findTranscript(sessionId, io.env);
    const userLines = file ? await agent.countUserLines(file).catch(() => 0) : 0;
    if (userLines > 0)
      view.transcriptWarning = `the transcript has ${userLines} user line(s) but none read as a message; Claude Code's transcript format may have changed`;
  }
  view.inbox = projectPaths(given).inbox(sessionId);
  io.out(JSON.stringify(view, null, 2));
}
async function effectiveRecord(root, sessionId, loaded, messages) {
  if (!loaded.found || !loaded.ok) return null;
  const upgraded = messages ? upgradeSessionIds(loaded.data, messages) : loaded.data;
  const events = await readEvents(root, sessionId);
  return { ...upgraded, nodes: applyEvents(upgraded.nodes, events) };
}
function recordedIdsOf(session) {
  return new Set(session?.nodes.map((node) => node.id) ?? []);
}
var LAST_MESSAGES = 5;
async function newMessages(messages, recorded, labels, root, env) {
  const gitRoot = await findGitRoot(root);
  const out = [];
  for (const [i, message] of messages.entries()) {
    if (isRecorded(recorded, message)) continue;
    const previous = i > 0 ? messages[i - 1] : void 0;
    const gapMinutes = previous === void 0 ? void 0 : Math.max(0, Math.round((Date.parse(message.at) - Date.parse(previous.at)) / 6e4));
    const committed = previous !== void 0 && gitRoot !== void 0 && await commitBetween(gitRoot, previous.at, message.at, env);
    out.push({
      id: message.hash,
      label: labels.get(message.hash) ?? message.label,
      at: message.at,
      text: agent.excerpt(message.text),
      ...gapMinutes === void 0 ? {} : { gapMinutes },
      ...message.resumed ? { resumed: true } : {},
      ...committed ? { commitBetween: true } : {}
    });
  }
  return out;
}
var CANDIDATE_SESSIONS = 8;
var CANDIDATE_MESSAGES = 3;
var CANDIDATE_BRANCHES = 8;
var CONTINUES = /\b(devam|kaldığımız yerden|continue)\b/i;
function branchesOf(nodes) {
  const messages = nodes.filter((node) => node.kind === "message").sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  const byId = new Map(messages.map((node) => [node.id, node]));
  const startOf = (id) => {
    const seen = /* @__PURE__ */ new Set();
    let cur = id;
    while (cur !== null && !seen.has(cur)) {
      seen.add(cur);
      const node = byId.get(cur);
      if (!node) return null;
      if (node.branch) return node.id;
      cur = node.parent ?? null;
    }
    return null;
  };
  const last = /* @__PURE__ */ new Map();
  for (const node of messages) {
    const start = startOf(node.id);
    if (start !== null) last.set(start, node);
  }
  return messages.filter((node) => node.branch).slice(-CANDIDATE_BRANCHES).map((node) => {
    const end = last.get(node.id) ?? node;
    return {
      title: node.branch?.title ?? node.title,
      ...node.branch?.open ? { open: node.branch.open } : {},
      first: node.id,
      last: { id: end.id, title: end.title }
    };
  });
}
async function candidateSessions(root, sessionId, env, limit = CANDIDATE_SESSIONS) {
  const current = await loadSession(root, sessionId);
  const me = stampedIdentity(
    current.found && current.ok ? current.data : void 0,
    await sessionIdentity(root, env)
  );
  const recent = [];
  for (const id of await listSessionIds(projectPaths(root).sessions)) {
    if (id === sessionId) continue;
    const loaded = await loadSession(root, id);
    if (loaded.found && loaded.ok && sameAuthor(loaded.data, me)) recent.push(loaded.data);
  }
  recent.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const out = [];
  for (const candidate of recent) {
    if (!candidate.nodes.some((node) => node.kind === "message")) continue;
    const messages = await readSessionMessages(root, candidate.sessionId, env);
    const record = await effectiveRecord(
      root,
      candidate.sessionId,
      { found: true, ok: true, data: candidate, warnings: [] },
      messages
    );
    const nodes = record?.nodes ?? candidate.nodes;
    const effective = nodes.filter((node) => node.kind === "message").sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
    out.push({
      sessionId: candidate.sessionId,
      title: candidate.title,
      updatedAt: candidate.updatedAt,
      ...candidate.leftOff ? { leftOff: candidate.leftOff } : {},
      branches: branchesOf(nodes),
      messages: effective.slice(-CANDIDATE_MESSAGES).map(({ id: messageId, title, at }) => ({
        id: messageId,
        title,
        ...at === void 0 ? {} : { at }
      }))
    });
    if (out.length === limit) break;
  }
  return out;
}
async function parentCandidates(root, sessionId, first, io) {
  const sessions = await candidateSessions(root, sessionId, io.env);
  const file = await agent.findTranscript(sessionId, io.env);
  const handoff = file ? await agent.readsHandoff(file).catch(() => false) : false;
  return {
    forMessage: { id: first.hash, label: first.label },
    ...handoff || CONTINUES.test(first.text) ? { continuesHint: true } : {},
    sessions
  };
}
function lastMessages(session, labels, limit) {
  if (!session) return [];
  const position = (id) => {
    const match = /^m([1-9][0-9]*)$/.exec(labels.get(id) ?? "");
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  };
  const messages = session.nodes.filter((n) => n.kind === "message").sort((a, b) => position(a.id) - position(b.id)).slice(-limit);
  return messages.map(({ id, title, parent }) => {
    const label = labels.get(id);
    return { id, ...label === void 0 ? {} : { label }, title, parent };
  });
}

// src/commands/close.ts
var USER_LIMIT = 400;
var REPLY_LIMIT = 220;
function clip(text, limit) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit)}\u2026` : flat;
}
function threadMembers(spec, known) {
  const out = [];
  for (const match of spec.matchAll(/m(\d+)(?:\s*[-–]\s*m?(\d+))?/g)) {
    const from = Number(match[1]);
    const to = match[2] === void 0 ? from : Number(match[2]);
    for (let n = from; n <= Math.min(to, from + 1e4); n += 1)
      if (known.has(`m${n}`)) out.push(`m${n}`);
  }
  return out;
}
function deriveParents(order, threads) {
  const known = new Set(order);
  const threadOf = /* @__PURE__ */ new Map();
  threads.forEach((thread, index) => {
    for (const label of threadMembers(thread.messages, known))
      if (!threadOf.has(label)) threadOf.set(label, index);
  });
  const position = new Map(order.map((label, at) => [label, at]));
  const latest = /* @__PURE__ */ new Map();
  const parents = /* @__PURE__ */ new Map();
  order.forEach((label, at) => {
    const thread = threadOf.get(label);
    if (at > 0) {
      const previous = order[at - 1];
      let parent = previous;
      if (thread !== void 0 && thread !== threadOf.get(previous)) {
        const seen = latest.get(thread);
        if (seen !== void 0) parent = seen;
        else {
          const from = threads[thread]?.from;
          if (from === null) parent = null;
          else if (typeof from === "string") {
            const target = from.split(":").at(-1) ?? "";
            const targetAt = position.get(target);
            if (targetAt !== void 0 && targetAt < at) parent = target;
          }
        }
      }
      parents.set(label, parent);
    }
    if (thread !== void 0) latest.set(thread, label);
  });
  return parents;
}
function summaryOf(thread) {
  const parsed2 = BranchSummary.safeParse({
    title: clip(thread.name ?? "", 80),
    asked: clip(thread.asked ?? "", 300),
    outcome: clip(thread.outcome ?? "", 600),
    open: clip(thread.open ?? "", 300)
  });
  return parsed2.success ? parsed2.data : void 0;
}
function candidatePart(sessions) {
  if (sessions.length === 0) return [];
  const lines = sessions.map((s) => {
    const branches = s.branches.map(
      (b) => `    \xB7 ${b.title}${b.open ? ` (open: ${clip(b.open, 120)})` : ""} \u2192 ${s.sessionId}:${b.last.id}`
    ).join("\n");
    const last = s.messages.at(-1);
    return [
      `- ${s.sessionId} "${s.title}" (${s.updatedAt})${s.leftOff ? `: ${s.leftOff}` : ""}`,
      branches,
      last ? `    \xB7 last message: ${last.title} \u2192 ${s.sessionId}:${last.id}` : ""
    ].filter(Boolean).join("\n");
  });
  return [
    "Earlier sessions of this project, newest first, with where each left off and its threads:",
    ...lines,
    'If the first message continues one of them, set "continues" to the reference after \u2192 of the thread it picks up; otherwise null. Only when the first message clearly continues that work.',
    ""
  ];
}
function closePrompt(turns, record, opts) {
  const writing = opts.language === "auto" ? "the conversation's language" : opts.language;
  const nodes = new Map(record.nodes.map((node) => [node.id, node]));
  const labelOf = new Map(turns.map((turn) => [turn.hash ?? turn.id, turn.label ?? turn.id]));
  let previousAt;
  const blocks = turns.map((turn) => {
    const node = nodes.get(turn.hash ?? turn.id);
    const gap = previousAt === void 0 ? 0 : Math.round((Date.parse(turn.at) - Date.parse(previousAt)) / 6e4);
    previousAt = turn.at;
    const parent = node?.parent ? labelOf.get(node.parent) ?? node.parent : "null";
    return [
      `### ${turn.label ?? turn.id} \xB7 ${turn.at}${gap >= 30 ? ` \xB7 gap ${gap} min` : ""} \xB7 current parent=${parent}`,
      ...node ? [`title: ${node.title}`] : [],
      `USER: ${clip(turn.text, USER_LIMIT)}`,
      `AGENT: ${clip(turn.replies.join(" "), REPLY_LIMIT) || "(no written reply)"}`,
      ...actionLines(turn).map((line) => line.slice(0, 260))
    ].join("\n");
  });
  const status = opts.status ? ', "status": {"goal": "one sentence", "done": ["..."], "pending": [{"text": "...", "needsUser": true}], "next": "a concrete step"}' : "";
  return [
    "You close a cogit lineage record at the end of a coding session. Each user message below is listed with what the agent did.",
    "Split the session into threads. A thread is one line of work with one goal: a feature, a bug, a release, a discussion, an idea.",
    "",
    "Rules:",
    `- Every message belongs to exactly one thread. List a thread's messages as ranges, e.g. "m7-m15, m19-m33": a thread can pause for a detour and resume later.`,
    "- A detour is a thread the user opens in the middle of another one and then leaves (a side question, an idea, an unrelated check). When the user goes back to the earlier work, those messages belong to the earlier thread again.",
    "- Short approvals and follow-ups ('do it', 'yap hadi', 'commit at', 'ne durumday\u0131z?') belong to the thread of the message before them.",
    "- Similar subject is not enough to join threads; the goal must be the same.",
    "- For each thread give `from`: the message whose outcome it starts from. Usually the message just before the thread's first message; for a detour the message it interrupts (the same); for a new task after a finished one, the last message of the finished thread; null only if the first message would work as the first message of a brand-new chat.",
    "",
    "Then write a branch summary for every thread (asked: what the user wanted; outcome: what it meant and what came of it; open: what is still open, or empty), and leftOff: one line saying where the session left off, so a later session can decide whether to continue it.",
    "Outcome, open and leftOff describe the state at the end: read each thread to its last message, and the whole session to its last messages. A problem or task a later message fixed, finished or dropped is done, not open; never report a mid-session state as where things stand.",
    `Write text in ${writing}; JSON keys stay English. Never invent what is not in the record. Never write secrets, credentials or personal data.`,
    "",
    ...candidatePart(opts.candidates),
    `Return only one JSON object, no code fences: {"threads": [{"name": "a few words", "messages": "m1-m6, m55-m66", "from": null, "asked": "...", "outcome": "...", "open": ""}], "leftOff": "..."${opts.candidates.length > 0 ? ', "continues": null' : ""}${status}}`,
    "",
    ...blocks
  ].join("\n");
}
function closePayload(answer, turns, record, opts) {
  const nodes = new Map(record.nodes.map((node) => [node.id, node]));
  const recorded = turns.filter((turn) => nodes.has(turn.hash ?? turn.id));
  const order = recorded.map((turn) => turn.label ?? turn.id);
  const idOf = new Map(recorded.map((turn) => [turn.label ?? turn.id, turn.hash ?? turn.id]));
  const threads = (Array.isArray(answer.threads) ? answer.threads : []).filter(
    (t) => typeof t === "object" && t !== null && typeof t.messages === "string"
  );
  const parents = threads.length > 0 ? deriveParents(order, threads) : /* @__PURE__ */ new Map();
  const branches = /* @__PURE__ */ new Map();
  const known = new Set(order);
  for (const thread of threads) {
    const first = threadMembers(thread.messages, known).sort(
      (a, b) => order.indexOf(a) - order.indexOf(b)
    )[0];
    const summary = summaryOf(thread);
    if (first !== void 0 && summary && !branches.has(first)) branches.set(first, summary);
  }
  const out = [];
  order.forEach((label, at) => {
    const id = idOf.get(label);
    const node = nodes.get(id);
    if (!node) return;
    const entry = { id: label, kind: "message", title: node.title };
    let changed = false;
    if (at === 0) {
      const continues = answer.continues;
      if (node.parent === null && typeof continues === "string" && parseMessageRef(continues).sessionId !== null) {
        entry.parent = continues;
        changed = true;
      }
    } else if (parents.has(label)) {
      const parent = parents.get(label);
      const parentId = parent === null ? null : idOf.get(parent) ?? parent;
      if (parentId !== (node.parent ?? null)) {
        entry.parent = parent;
        changed = true;
      }
    }
    const branch = branches.get(label);
    if (branch) {
      entry.branch = branch;
      changed = true;
    }
    if (changed) out.push(entry);
  });
  const payload = { sessionId: record.sessionId, nodes: out };
  if (typeof answer.leftOff === "string" && answer.leftOff.trim() !== "")
    payload.leftOff = clip(answer.leftOff, 400);
  const status = opts.status ? Status.safeParse(answer.status) : void 0;
  if (status?.success) payload.status = status.data;
  return payload;
}
async function closeSession(root, sessionId, io) {
  const agent3 = defaultAgent();
  const file = await agent3.findTranscript(sessionId, io.env);
  const loaded = await loadSession(root, sessionId);
  if (!file || !loaded.found || !loaded.ok) {
    io.out(`session ${sessionId} has no record to close`);
    return;
  }
  const turns = hashTurns(sessionId, await agent3.readConversation(file));
  const upgraded = upgradeSessionIds(loaded.data, turns);
  const record = {
    ...upgraded,
    nodes: applyEvents(upgraded.nodes, await readEvents(root, sessionId))
  };
  const recorded = new Set(record.nodes.map((node) => node.id));
  const closing = turns.filter((turn) => recorded.has(turn.hash ?? turn.id));
  if (closing.length === 0) {
    io.out(`session ${sessionId} has no recorded message to close`);
    return;
  }
  const config = await loadConfig(io.env);
  const firstNode = record.nodes.find((node) => node.id === (closing[0]?.hash ?? ""));
  const candidates = firstNode && firstNode.parent === null ? await candidateSessions(root, sessionId, io.env) : [];
  const status = config.recorder === "side";
  const prompt = closePrompt(closing, record, {
    language: config.language,
    candidates,
    status
  });
  const answer = agentRecord(resultText(await runClaude(prompt, config.sideModel, io.env)));
  const payload = closePayload(answer, closing, record, { status });
  await sessionWrite({ dir: root, by: "side" }, io, async () => JSON.stringify(payload));
}

// src/commands/backfill.ts
var TEXT_LIMIT = 1500;
function cut(text) {
  return text.length <= TEXT_LIMIT ? text : `${text.slice(0, TEXT_LIMIT)}\u2026`;
}
function turnBlock(turn) {
  const agent3 = turn.replies.length === 0 ? "(no written reply)" : turn.replies.map(cut).join("\n\n");
  const { commands, other } = turn.tools;
  const tools = `${commands} command(s), ${turn.tools.files.length} file(s) edited, ${other} other tool call(s)`;
  return [
    `### ${turn.label ?? turn.id} \xB7 ${turn.at}`,
    `USER: ${cut(turn.text)}`,
    `AGENT: ${agent3}`,
    `TOOLS: ${tools}`,
    ...actionLines(turn)
  ].join("\n");
}
function actionLines(turn) {
  const lines = [];
  const asks = turn.tools.asks ?? [];
  if (asks.length > 0) lines.push(`ASKED THE USER: ${asks.slice(0, 5).join(" ; ")}`);
  if (turn.tools.files.length > 0)
    lines.push(`FILES EDITED: ${turn.tools.files.slice(0, 12).join(", ")}`);
  const steps = turn.tools.steps ?? [];
  if (steps.length > 0) lines.push(`STEPS: ${steps.slice(0, 15).join(" ; ")}`);
  return lines;
}
function recordPart(record) {
  if (!record || record.nodes.length === 0) return "The record has no nodes yet.";
  const lines = record.nodes.map(
    (node) => `- ${node.id} (${node.kind}) parent=${node.parent ?? "null"}: ${node.title}`
  );
  return `The record so far (reuse these ids; a parent is an earlier message):
${lines.join("\n")}`;
}
function rules(language, messageSummaries, recorder) {
  const writing = language === "auto" ? "the conversation's language" : language;
  const lines = [
    "Rules (from the cogit lineage skill):",
    '- Send one "message" node for every message below, with the id exactly as given in its heading (m1, m2, \u2026); skip none, even a short "ok". Never make up an id.',
    "- The session title: when the record's title is empty, send one (a few words on what the session is about); a session without one shows only its id on the map.",
    `- kind is "message". title: a few words in the user's own wording.${messageSummaries ? " summary: one or two sentences on what came of it." : ""}`,
    "- parent: an earlier message id, or null when the message starts a new thread; never a topic or phase node.",
    "- Back to an older thread: that message is the parent and the previous one goes in links (at most 5). Unsure: use the previous message.",
    '- When the message itself made a decision (the user asked for it, picked an option or approved a proposal): decidedBy ("user" or "agreed"), the reason in why, and the options not taken in alternatives [{"option": "...", "why": "..."}].',
    `- The agent's work belongs inside the message node that caused it, never in nodes of its own: work (short items), agentDecisions ([{"title": "...", "why": "...", "alternatives": [...]}]) only for technical choices with a reason \u2014 never for proposals or work items \u2014 commits (short hashes) and files (a few paths).`,
    "- Write a branch summary ({title, asked, outcome, open}) on the first message of a branch when the branch ends.",
    `- Never send "at"; the CLI takes each message's time from the transcript.`,
    "- Replace the whole status (goal, done, pending [{text, needsUser}], next) when it changed; otherwise leave it out.",
    "- Record decisions and reasons, never secrets, credentials, personal data, file contents or command output.",
    `- Write titles and text in ${writing}; JSON keys stay in English.`
  ];
  if (recorder === "mixed") {
    lines.push(
      "- This is a periodic background run: send only message nodes with their titles, parents and user decisions, and the session title when it is empty. Do not send status, branch summaries or agentDecisions; the main agent owns those."
    );
  }
  return lines.join("\n");
}
function catchUpPrompt(turns, record, sessionId, language, messageSummaries = false, recorder = "agent") {
  return [
    "You add the missing part of a cogit lineage record, a map of the user's messages.",
    "Below are the user's messages that have no node yet, each followed by the agent's written replies and what the agent did: the questions it asked the user with their options, the files it edited and its steps. Use these to find the agent's technical decisions and what it rejected.",
    "",
    rules(language, messageSummaries, recorder),
    "",
    recordPart(record),
    "",
    "Messages to record:",
    turns.map(turnBlock).join("\n\n"),
    "",
    `Return only one JSON object, no commentary and no code fences: {"sessionId": ${JSON.stringify(
      sessionId
    )}, "nodes": [...], "status": {...}}`
  ].join("\n");
}
function resultText(stdout) {
  let envelope;
  try {
    envelope = JSON.parse(stdout);
  } catch {
    throw new CliError("claude did not print valid JSON");
  }
  const result = envelope.result;
  if (typeof result !== "string") throw new CliError("claude returned no result text");
  return result;
}
function agentRecord(text) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  let parsed2;
  try {
    parsed2 = JSON.parse(cleaned);
  } catch {
    throw new CliError("the agent did not return a JSON record");
  }
  if (typeof parsed2 !== "object" || parsed2 === null || Array.isArray(parsed2))
    throw new CliError("the agent did not return a JSON object");
  return parsed2;
}
function withoutNulls(record) {
  const top = Object.fromEntries(Object.entries(record).filter(([, value]) => value !== null));
  if (!Array.isArray(top.nodes)) return top;
  return {
    ...top,
    nodes: top.nodes.map(
      (node) => typeof node === "object" && node !== null ? Object.fromEntries(
        Object.entries(node).filter(([key, value]) => value !== null || key === "parent")
      ) : node
    )
  };
}
function headlessEnv(env) {
  return { ...process.env, ...env, COGIT_DISABLE: "1" };
}
function claudeBin() {
  return process.platform === "win32" ? "claude.cmd" : "claude";
}
var CLAUDE_TIMEOUT_MS = 5 * 6e4;
function runClaude(prompt, model, env) {
  const limit = Number(env.COGIT_CLAUDE_TIMEOUT_MS) || CLAUDE_TIMEOUT_MS;
  return new Promise((resolve7, reject) => {
    const child = spawn(
      claudeBin(),
      [
        "-p",
        "--safe-mode",
        "--no-session-persistence",
        "--model",
        model,
        "--output-format",
        "json"
      ],
      { env: headlessEnv(env), stdio: ["pipe", "pipe", "pipe"] }
    );
    let out = "";
    let err = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, limit);
    child.stdin.on("error", () => {
    });
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      err += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new CliError(`could not run claude: ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut)
        reject(new CliError(`claude did not answer within ${Math.round(limit / 1e3)} s`));
      else if (code === 0) resolve7(out);
      else reject(new CliError(`claude exited with ${code}: ${err.trim() || "no output"}`));
    });
    child.stdin.end(prompt);
  });
}
async function missingTurns(root, sessionId, env) {
  const agent3 = defaultAgent();
  const file = await agent3.findTranscript(sessionId, env);
  if (!file) return [];
  const turns = hashTurns(sessionId, await agent3.readConversation(file));
  const loaded = await loadSession(root, sessionId);
  let recorded = /* @__PURE__ */ new Set();
  if (loaded.found && loaded.ok) {
    const upgraded = upgradeSessionIds(loaded.data, turns);
    const events = await readEvents(root, sessionId);
    recorded = new Set(applyEvents(upgraded.nodes, events).map((node) => node.id));
  }
  return turns.filter((turn) => !isRecorded(recorded, turn));
}
async function backfillTail(dir, sessionId, io, opts = {}) {
  const { root } = await resolveProjectRoot(dir);
  const project = await loadProject(root);
  if (!project.found) throw new CliError(`${root} is not initialized; run \`cogit init\` first`);
  if (!project.ok) throw new CliError(project.error);
  let turns;
  try {
    turns = await withLock(
      projectPaths(root).lock(`session-${sessionId}`),
      () => missingTurns(root, sessionId, io.env),
      { timeoutMs: 0 }
    );
  } catch (err) {
    if (!(err instanceof LockBusyError)) throw err;
    io.out(`the side model is already recording ${sessionId}`);
    return;
  }
  if (turns.length === 0) {
    io.out(`session ${sessionId} has nothing left to record`);
    if (opts.close === true) await closeSession(root, sessionId, io);
    await maybeAutoCommit(root, sessionId, io.env);
    return;
  }
  const config = await loadConfig(io.env);
  const loaded = await loadSession(root, sessionId);
  const record = loaded.found && loaded.ok ? loaded.data : void 0;
  const prompt = catchUpPrompt(
    turns,
    record,
    sessionId,
    config.language,
    config.messageSummaries,
    config.recorder
  );
  const stdout = await runClaude(prompt, config.sideModel, io.env);
  const payload = { ...withoutNulls(agentRecord(resultText(stdout))), sessionId };
  await sessionWrite({ dir: root, by: "side" }, io, async () => JSON.stringify(payload));
  if (opts.close === true) await closeSession(root, sessionId, io);
  await maybeAutoCommit(root, sessionId, io.env);
}

// src/share.ts
async function refreshShareConversations(env, share) {
  const registry = await loadRegistry(env);
  if (!registry.found || !registry.ok) return;
  for (const entry of registry.data.projects) {
    if (!await isDirectory(entry.path)) continue;
    try {
      await refreshCogitGitignore(entry.path, share);
    } catch {
    }
  }
}

// src/commands/config.ts
var CONFIG_KEYS = Object.keys(Config.shape).filter((k) => k !== "schema");
var LISTED_CONFIG_KEYS = CONFIG_KEYS.filter((k) => k !== "catchUpModel");
function canonicalKey(key) {
  return key === "catchUpModel" ? "sideModel" : key;
}
function assertKey(key) {
  if (!CONFIG_KEYS.includes(key)) {
    throw new CliError(`unknown key "${key}"; one of: ${CONFIG_KEYS.join(", ")}`);
  }
}
function parseValue(key, raw) {
  if (key === "agents" && !raw.trim().startsWith("[")) {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
async function configGet(key, io) {
  const config = await loadConfig(io.env);
  if (key === void 0) {
    for (const k of LISTED_CONFIG_KEYS) io.out(`${k} = ${JSON.stringify(config[k])}`);
    return;
  }
  assertKey(key);
  const name = canonicalKey(key);
  io.out(JSON.stringify(config[name]));
}
async function configSet(key, raw, io) {
  assertKey(key);
  const value = parseValue(key, raw);
  const next = Config.safeParse({ ...await loadConfig(io.env), [key]: value });
  if (!next.success) {
    throw new CliError(`invalid value for ${key}: ${next.error.issues[0]?.message ?? "rejected"}`);
  }
  const name = canonicalKey(key);
  await updateConfig((c) => ({ ...c, [name]: next.data[key] }), io.env);
  if (name === "shareConversations")
    await refreshShareConversations(io.env, next.data.shareConversations);
  io.out(`${name} = ${JSON.stringify(next.data[key])}`);
}
async function configGitShow(dir, io) {
  const { root } = await resolveProjectRoot(dir);
  const project = await loadProject(root);
  if (!project.found) throw new CliError(`${root} is not initialized; run \`cogit init\` first`);
  if (!project.ok) throw new CliError(project.error);
  const policy = await cogitIgnored(root) ? "ignore" : "commit";
  io.out(`Git policy for ${project.data.name}: ${policy}`);
}
async function configGit(dir, policy, io) {
  const { root } = await resolveProjectRoot(dir);
  const project = await loadProject(root);
  if (!project.found) throw new CliError(`${root} is not initialized; run \`cogit init\` first`);
  if (!project.ok) throw new CliError(project.error);
  if (await findGitRoot(root) === void 0)
    throw new CliError(`${root} is not in a git repository`);
  const added = await ensureGitignore(root, policy);
  const config = await loadConfig(io.env);
  await ensureCogitGitignore(root, policy, config.shareConversations);
  await installGitHooks(root);
  io.out(`Git policy for ${project.data.name}: ${policy}`);
  if (added.length > 0) io.out(`Added to .gitignore: ${added.join(", ")}`);
}
async function configHintOff(dir, io) {
  const { root } = await resolveProjectRoot(dir);
  let added = false;
  await updateConfig((c) => {
    if (c.setupHintOff.includes(root)) return c;
    added = true;
    return { ...c, setupHintOff: [...c.setupHintOff, root] };
  }, io.env);
  io.out(added ? `Setup hint off in ${root}` : `Setup hint was already off in ${root}`);
}
async function configHintOn(dir, opts, io) {
  if (opts.all === true) {
    await updateConfig((c) => ({ ...c, setupHintOff: [] }), io.env);
    io.out("Setup hint on in every project");
    return;
  }
  const { root } = await resolveProjectRoot(dir);
  let removed = false;
  await updateConfig((c) => {
    if (!c.setupHintOff.includes(root)) return c;
    removed = true;
    return { ...c, setupHintOff: c.setupHintOff.filter((path2) => path2 !== root) };
  }, io.env);
  io.out(removed ? `Setup hint on in ${root}` : `Setup hint was not off in ${root}`);
}
async function configPrune(opts, io) {
  const loaded = await loadRegistry(io.env);
  if (loaded.found && !loaded.ok) throw new CliError(`registry: ${loaded.error}`);
  const entries = loaded.found && loaded.ok ? loaded.data.projects : [];
  const missing = [];
  for (const entry of entries) {
    if (!await isDirectory(entry.path)) missing.push(entry);
  }
  if (missing.length === 0) {
    io.out("No missing projects");
    return;
  }
  for (const entry of missing) {
    io.out(`${opts.dryRun === true ? "Would remove" : "Removed"} ${entry.name} (${entry.path})`);
  }
  if (opts.dryRun === true) return;
  await updateRegistry(
    (r) => ({ ...r, projects: r.projects.filter((p) => !missing.some((m) => m.path === p.path)) }),
    io.env
  );
}

// src/commands/doctor.ts
import { readFile as readFile4, stat as stat3 } from "fs/promises";
import { basename as basename2, dirname as dirname2, join as join3 } from "path";

// src/server.ts
import { spawn as spawn2 } from "child_process";
import { randomBytes, timingSafeEqual } from "crypto";
import { existsSync, watch } from "fs";
import { readFile as readFile3 } from "fs/promises";
import {
  createServer as createHttpServer
} from "http";
import { createRequire } from "module";
import { basename, join as join2, resolve as resolve5 } from "path";
import { fileURLToPath } from "url";

// src/diff.ts
import { execFile } from "child_process";
import { relative, resolve as resolve4, sep } from "path";
import { promisify } from "util";
var exec = promisify(execFile);
var DIFF_MAX_BYTES = 400 * 1024;
var DIFF_TIMEOUT_MS = 1e4;
var READ_MAX_BUFFER = DIFF_MAX_BYTES * 8;
function isDiffSha(value) {
  return /^[0-9a-f]{7,40}$/i.test(value);
}
function diffTooLarge(sha) {
  return `diff too large, run \`git show ${sha}\``;
}
function normalizeDiff(text) {
  let binary = false;
  const normalized = text.split("\n").map((line) => {
    if (/^Binary files .+ and .+ differ$/.test(line)) {
      binary = true;
      return "binary file changed";
    }
    return line;
  }).join("\n");
  return { text: normalized, binary };
}
async function commitFiles(gitRoot, sha) {
  const { stdout } = await exec("git", ["-C", gitRoot, "show", "--format=", "--name-only", sha], {
    maxBuffer: READ_MAX_BUFFER,
    timeout: DIFF_TIMEOUT_MS
  });
  return stdout.split("\n").map((line) => line.trim()).filter((line) => line !== "");
}
async function readCommitDiff(root, input, file) {
  if (!isDiffSha(input)) return { ok: false, reason: "unknown-commit" };
  const sha = input.toLowerCase();
  const gitRoot = await findGitRoot(root);
  if (gitRoot === void 0) return { ok: false, reason: "no-git" };
  try {
    await exec("git", ["-C", gitRoot, "rev-parse", "--verify", "--quiet", `${sha}^{commit}`], {
      maxBuffer: READ_MAX_BUFFER,
      timeout: DIFF_TIMEOUT_MS
    });
  } catch {
    return { ok: false, reason: "unknown-commit" };
  }
  const files = await commitFiles(gitRoot, sha);
  let repoFile;
  if (file !== void 0) {
    const wanted = file.split("\\").join("/").replace(/^\.\//, "");
    repoFile = relative(gitRoot, resolve4(root, wanted)).split(sep).join("/");
    const kept = projectFiles(gitRoot, root, /* @__PURE__ */ new Map([[sha, files]])).get(sha) ?? [];
    if (!kept.includes(wanted)) return { ok: false, reason: "file-not-in-commit" };
  }
  const args = ["-C", gitRoot, "show", "--format=", "--patch", "--no-color", sha];
  if (repoFile !== void 0) args.push("--", repoFile);
  try {
    const { stdout } = await exec("git", args, {
      maxBuffer: READ_MAX_BUFFER,
      timeout: DIFF_TIMEOUT_MS
    });
    if (Buffer.byteLength(stdout, "utf8") > DIFF_MAX_BYTES) {
      return { ok: false, reason: "too-large" };
    }
    return { ok: true, text: normalizeDiff(stdout).text };
  } catch {
    return { ok: false, reason: "too-large" };
  }
}

// src/view/settings.ts
var EDITABLE = [
  {
    key: "recorder",
    label: "Recording",
    help: "How much of the chat goes into the record.",
    details: "Economical (recommended): a small model records in the background every few turns and closes each session with one pass that finds its threads, writes the branch summaries and one line on where the session left off. The agent is never interrupted; it costs about a cent per session. Detailed: on top of that, the main agent records its own decisions every 15 turns. It catches the agent's technical choices best and costs about 1\u20132% of a session. A third mode, where only the main agent records, is set with `cogit config set recorder agent`.",
    kind: "select",
    options: [
      { value: "side", label: "Economical (recommended)" },
      { value: "mixed", label: "Detailed" }
    ]
  },
  {
    key: "messageSummaries",
    label: "One-line summary under each message",
    help: "A sentence under each message title on the map.",
    details: "A one-sentence summary under each message title, so a skim reads better. Off keeps the record shorter and cheaper. Branch summaries and the line on where a session left off are written either way.",
    kind: "boolean"
  },
  {
    key: "startupContext",
    label: "Lineage at session start",
    help: "Hand the agent the previous session's lineage when a chat starts.",
    details: "When a chat starts, the agent gets a short summary of where the previous session left off and how to read the record. It costs a few tokens; turn it off if your projects are unrelated.",
    kind: "boolean"
  },
  {
    key: "recordHeadless",
    label: "Headless sessions",
    help: "Record sessions that start without a person, such as `claude -p`.",
    details: "Some plugins and scripts run `claude -p` in the background, often once per prompt. Off, cogit leaves those sessions out of the map and the inbox. Turn it on if you do real work through `claude -p` or the SDK and want it recorded.",
    kind: "boolean"
  },
  {
    key: "tryBeforeNotes",
    label: "Tried-before notes",
    help: "Before the agent edits a file, tell it which options earlier thoughts rejected for it.",
    details: "Before the agent edits a file, it hears which options earlier thoughts tried and rejected for that file. These are notes from the record, never rules; they can make the agent ask before repeating a dead end.",
    kind: "boolean"
  },
  {
    key: "shapes",
    label: "Intent, Shape and Code",
    help: "A small picture of what each change does, beside its reason and its diff.",
    details: "For every message that landed commits, a small representation of what the change does: numbered plain-language steps or a Mermaid diagram. It sits between the record's intent (the decision, reason and rejected options) and the code (the diff), so a reviewer sees why, what and how in one place. The recorder writes it, not you; it costs one small model call per such message. Off, the map says so and nothing is written.",
    kind: "boolean"
  },
  {
    key: "language",
    label: "Language",
    help: "Language the agent writes records in; `auto` follows the chat.",
    details: "The language the record is written in. With auto, it follows the language of the conversation.",
    kind: "text"
  },
  {
    key: "shareConversations",
    label: "Share conversations",
    help: "Commit the raw chat text too, not only the session record (off: chat stays local).",
    details: "Also commit the raw chat text, not only the record. Leave it off to keep conversations on your machine while the record still travels with the branch.",
    kind: "boolean"
  },
  {
    key: "recordCommit",
    label: "Commit the record",
    help: "ask, auto or off: what to do with the last messages after the last code commit.",
    details: "What happens to record changes made after your last code commit: ask you next time, commit them automatically, or leave them for you to commit.",
    kind: "text"
  }
];
var CLI_ONLY = [
  {
    key: "updateEveryTurns",
    label: "Record every N turns",
    help: "Ask the agent to record after this many turns.",
    details: "How often the main agent is asked to update the record inside the chat. In mixed mode the side model records in between, so this can be rare (15 turns by default)."
  },
  {
    key: "sideEveryTurns",
    label: "Side model every N turns",
    help: "How often the background recorder writes in mixed or side mode.",
    details: "How often the small side model records in the background. A lower number keeps the map fresher and costs a little more; a higher number is quieter."
  },
  {
    key: "sessionEndCatchUp",
    label: "Side model at session end",
    help: "When a session ends, the side model records what is left and closes the session.",
    details: "When a session ends, the side model records whatever nobody got to, then reads the whole session once to find its threads, write the branch summaries and one line on where it left off. It runs outside the chat, so it does not spend the session's tokens."
  },
  {
    key: "sideModel",
    label: "Side model",
    help: "The small model that records outside the chat.",
    details: "The small model behind every side record: every few turns in mixed mode, all the time in side mode, and at session end. Haiku is cheap and good enough for titles, parents and short decisions."
  },
  {
    key: "gitPolicy",
    label: "Git policy",
    help: "What `cogit init` offers a new project: commit the record to git, or ignore it.",
    details: "Only the default for new projects: each project answers it during `cogit init`. `cogit config git` shows the current project's policy and `cogit config git commit` or `ignore` switches it."
  },
  {
    key: "agents",
    label: "Agents",
    help: "Which agents record lineage; change it with `cogit config set`.",
    details: "Which AI agents in this project should record what they are asked and what they decide. Claude Code is the only one today."
  },
  {
    key: "inboxMaxAgeDays",
    label: "Inbox age",
    help: 'Days a waiting session stays in the "Your turn" inbox.',
    details: "A session that waits on you longer than this leaves the inbox. It is hidden, not deleted: the map still has it."
  },
  {
    key: "bigChangeLines",
    label: "Big change",
    help: "Lines of code after which a message counts as a big change on the map.",
    details: "Messages whose commits changed at least this many lines get a quiet highlight in the unread list. It never hides or ranks anything by itself."
  },
  {
    key: "trailerMaxAgeHours",
    label: "Trailer age",
    help: "How old the last message may be for a commit to get its `Thought:` trailer.",
    details: "A commit made hours after the last message is probably not about that message, so past this age the commit gets no trailer instead of a wrong one."
  },
  {
    key: "serverPort",
    label: "Server port",
    help: "Port of the local map server on 127.0.0.1.",
    details: "Change it only when another program already uses the port."
  }
];
function configHelpLines() {
  return [...EDITABLE, ...CLI_ONLY].map(
    (field) => `  ${field.key}
    ${field.label}: ${field.help}
    ${field.details}`
  );
}
function editableSettings(settings) {
  return {
    recorder: settings.recorder,
    messageSummaries: settings.messageSummaries,
    startupContext: settings.startupContext,
    recordHeadless: settings.recordHeadless,
    tryBeforeNotes: settings.tryBeforeNotes,
    shapes: settings.shapes,
    language: settings.language,
    shareConversations: settings.shareConversations,
    recordCommit: settings.recordCommit
  };
}

// src/server.ts
var VERSION = package_default.version;
var DEFAULT_IDLE_MS = 30 * 60 * 1e3;
var START_WAIT_MS = 1500;
var HOST = "127.0.0.1";
var LIVE_META = `<meta name="${LIVE_META_NAME}" content="1">`;
var CONFIG_TOKEN_HEADER = "x-cogit-token";
var CONFIG_BODY_LIMIT = 4096;
function injectLiveMeta(html) {
  if (html.includes(LIVE_META)) return html;
  return html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}${LIVE_META}`);
}
function injectTokenMeta(html, token) {
  const meta = `<meta name="${TOKEN_META_NAME}" content="${token}">`;
  if (html.includes(meta)) return html;
  return html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}${meta}`);
}
function hostAllowed(host, port) {
  return host === `${HOST}:${port}` || host === `localhost:${port}`;
}
function respond(res, status, body) {
  if (!res.headersSent) res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}
function respondJson(res, status, body) {
  if (!res.headersSent)
    res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}
async function registeredRoot(env, dir) {
  const requested = resolve5(dir);
  const registry = await loadRegistry(env);
  if (!registry.found || !registry.ok) return null;
  return registry.data.projects.some((entry) => resolve5(entry.path) === requested) ? requested : null;
}
async function pageTarget(env, url) {
  const panel = () => {
    const paths = globalPaths(env);
    return { file: paths.panel, dir: paths.base };
  };
  if (url.pathname === "/") return panel();
  if (url.pathname === "/map" || url.pathname === "/events") {
    const raw = url.searchParams.get("dir");
    if (!raw) return url.pathname === "/events" ? panel() : null;
    const root = await registeredRoot(env, raw);
    if (!root) return null;
    const paths = projectPaths(root);
    return { file: paths.html, dir: paths.base, root };
  }
  return null;
}
var MERMAID_PATH = "/assets/mermaid.js";
function mermaidFile() {
  const bundled = fileURLToPath(new URL("./mermaid.min.js", import.meta.url));
  if (existsSync(bundled)) return bundled;
  return createRequire(import.meta.url).resolve("mermaid/dist/mermaid.min.js");
}
async function serveMermaid(res, file) {
  let body;
  try {
    body = await readFile3(file);
  } catch {
    respond(res, 404, "not found");
    return;
  }
  res.writeHead(200, {
    "content-type": "text/javascript; charset=utf-8",
    "cache-control": "public, max-age=86400"
  });
  res.end(body);
}
function mapPageUrl(base, root) {
  return `${base}/map?dir=${encodeURIComponent(root)}`;
}
async function startMapServer(opts) {
  const env = opts.env ?? process.env;
  const hostname = opts.hostname ?? HOST;
  const idleMs = opts.idleMs ?? DEFAULT_IDLE_MS;
  const transcriptDebounceMs = opts.transcriptDebounceMs ?? 1e3;
  const pages = /* @__PURE__ */ new Map();
  const buildIo = {
    prompt: defaultsPrompter,
    out: () => {
    },
    warn: () => {
    },
    env,
    now: () => (/* @__PURE__ */ new Date()).toISOString()
  };
  let transcriptWatcher;
  let transcriptTimer = null;
  let rebuildQueue = Promise.resolve();
  const token = randomBytes(24).toString("hex");
  let openPages = 0;
  let idleTimer = null;
  let closing = null;
  let resolveClosed = () => {
  };
  const closed = new Promise((done) => {
    resolveClosed = done;
  });
  function clearIdle() {
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = null;
  }
  function scheduleIdle(ms) {
    clearIdle();
    idleTimer = setTimeout(() => {
      idleTimer = null;
      void close();
    }, ms);
  }
  function broadcast(page) {
    for (const client of page.clients) {
      if (client.writableEnded) continue;
      client.write("event: change\ndata: rebuilt\n\n");
    }
  }
  function watched(file, dir, root) {
    const existing = pages.get(file);
    if (existing) return existing;
    const page = {
      clients: /* @__PURE__ */ new Set(),
      timer: null,
      ...root === void 0 ? {} : { root }
    };
    try {
      page.watcher = watch(dir, { persistent: false }, (_event, name) => {
        if (name !== null && name.toString() !== basename(file)) return;
        if (page.timer !== null) clearTimeout(page.timer);
        page.timer = setTimeout(() => {
          page.timer = null;
          broadcast(page);
        }, 50);
      });
    } catch {
    }
    pages.set(file, page);
    return page;
  }
  function release(file, page) {
    if (page.clients.size > 0) return;
    page.watcher?.close();
    if (page.timer !== null) clearTimeout(page.timer);
    pages.delete(file);
  }
  async function rebuildOpenMaps() {
    const roots = /* @__PURE__ */ new Set();
    for (const page of pages.values()) {
      if (page.root !== void 0 && page.clients.size > 0) roots.add(page.root);
    }
    for (const root of roots) {
      try {
        await buildProject({ dir: root, io: buildIo, quiet: true });
      } catch {
      }
    }
  }
  function queueRebuild() {
    rebuildQueue = rebuildQueue.then(() => rebuildOpenMaps());
  }
  function startTranscriptWatch() {
    if (transcriptWatcher !== void 0) return;
    const dir = join2(defaultAgent().configDir(env), "projects");
    try {
      transcriptWatcher = watch(dir, { persistent: false, recursive: true }, (_event, name) => {
        if (name === null || !name.toString().endsWith(".jsonl")) return;
        if (transcriptTimer !== null) clearTimeout(transcriptTimer);
        transcriptTimer = setTimeout(() => {
          transcriptTimer = null;
          queueRebuild();
        }, transcriptDebounceMs);
      });
    } catch {
      transcriptWatcher = void 0;
    }
  }
  function stopTranscriptWatch() {
    transcriptWatcher?.close();
    transcriptWatcher = void 0;
    if (transcriptTimer !== null) clearTimeout(transcriptTimer);
    transcriptTimer = null;
  }
  function mapPagesOpen() {
    return [...pages.values()].some((page) => page.root !== void 0 && page.clients.size > 0);
  }
  const server = createHttpServer((req, res) => {
    void handle(req, res).catch(() => respond(res, 500, "internal error"));
  });
  function tokenMatches(given) {
    const value = Array.isArray(given) ? given[0] : given;
    if (typeof value !== "string") return false;
    const a = Buffer.from(value);
    const b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  function originAllowed(origin, port2) {
    return origin === `http://${HOST}:${port2}` || origin === `http://localhost:${port2}`;
  }
  function readOriginAllowed(origin, port2) {
    return origin === void 0 || originAllowed(origin, port2);
  }
  async function readLimitedBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      size += buf.length;
      if (size > CONFIG_BODY_LIMIT) {
        req.resume();
        return null;
      }
      chunks.push(buf);
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  async function refreshOpenPages() {
    let rebuiltMap = false;
    const registry = await loadRegistry(env);
    if (registry.found && registry.ok) {
      for (const entry of registry.data.projects) {
        const page = pages.get(projectPaths(entry.path).html);
        if (!page || page.clients.size === 0) continue;
        try {
          await buildProject({ dir: entry.path, io: buildIo, quiet: true });
          rebuiltMap = true;
        } catch {
        }
      }
    }
    if (rebuiltMap) return;
    try {
      await buildPanel({ env, io: buildIo });
    } catch {
    }
  }
  async function readConfig(req, res, port2) {
    if (!readOriginAllowed(req.headers.origin, port2) || !tokenMatches(req.headers[CONFIG_TOKEN_HEADER])) {
      respond(res, 403, "forbidden");
      return;
    }
    const config = await loadConfig(env);
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store"
    });
    res.end(JSON.stringify({ ok: true, settings: editableSettings(panelSettings(config)) }));
  }
  async function readMapViewRequest(req, res, port2, url2) {
    if (!readOriginAllowed(req.headers.origin, port2) || !tokenMatches(req.headers[CONFIG_TOKEN_HEADER])) {
      respond(res, 403, "forbidden");
      return;
    }
    const dir = url2.searchParams.get("dir");
    if (!dir) {
      respond(res, 400, "dir is required");
      return;
    }
    const root = await registeredRoot(env, dir);
    if (root === null) {
      respond(res, 403, "not a registered project");
      return;
    }
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store"
    });
    const view = await readMapView(root);
    res.end(JSON.stringify({ ok: true, rowWidths: view.rowWidths, open: view.open }));
  }
  async function readDiff(req, res, port2, url2) {
    if (!readOriginAllowed(req.headers.origin, port2) || !tokenMatches(req.headers[CONFIG_TOKEN_HEADER])) {
      respond(res, 403, "forbidden");
      return;
    }
    const dir = url2.searchParams.get("dir");
    const commit = url2.searchParams.get("commit");
    const file = url2.searchParams.get("file") || void 0;
    if (!dir) {
      respond(res, 400, "dir is required");
      return;
    }
    if (commit === null || !isDiffSha(commit)) {
      respond(res, 400, "commit must be 7\u201340 hex characters");
      return;
    }
    const root = await registeredRoot(env, dir);
    if (root === null) {
      respond(res, 403, "not a registered project");
      return;
    }
    const result = await readCommitDiff(root, commit, file);
    if (!result.ok) {
      if (result.reason === "file-not-in-commit") {
        respond(res, 400, "file is not part of this commit");
        return;
      }
      if (result.reason === "unknown-commit") {
        respond(res, 404, "commit not found");
        return;
      }
      if (result.reason === "no-git") {
        respond(res, 404, "not a git repository");
        return;
      }
      respondJson(res, 200, { ok: true, text: diffTooLarge(commit) });
      return;
    }
    respondJson(res, 200, { ok: true, text: result.text });
  }
  async function writeConfig(req, res, port2) {
    if (!originAllowed(req.headers.origin, port2) || !tokenMatches(req.headers[CONFIG_TOKEN_HEADER])) {
      respond(res, 403, "forbidden");
      return;
    }
    const type = req.headers["content-type"];
    if (typeof type !== "string" || type.split(";")[0]?.trim().toLowerCase() !== "application/json") {
      respond(res, 415, "content-type must be application/json");
      return;
    }
    const body = await readLimitedBody(req);
    if (body === null) {
      respond(res, 413, "request body too large");
      return;
    }
    let parsed2;
    try {
      parsed2 = JSON.parse(body);
    } catch {
      respond(res, 400, "invalid JSON");
      return;
    }
    if (parsed2 === null || typeof parsed2 !== "object" || Array.isArray(parsed2)) {
      respond(res, 400, "expected a JSON object");
      return;
    }
    const { key, value } = parsed2;
    if (typeof key !== "string" || !isPanelEditableKey(key)) {
      respond(res, 400, `unknown or read-only key: ${String(key)}`);
      return;
    }
    const next = Config.safeParse({ ...await loadConfig(env), [key]: value });
    if (!next.success) {
      respond(res, 400, `invalid value for ${key}: ${next.error.issues[0]?.message ?? "rejected"}`);
      return;
    }
    try {
      await updateConfig((c) => ({ ...c, [key]: next.data[key] }), env, { timeoutMs: 500 });
    } catch (err) {
      respond(res, err instanceof LockBusyError ? 409 : 500, "could not write the config");
      return;
    }
    if (key === "shareConversations")
      await refreshShareConversations(env, next.data.shareConversations);
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store"
    });
    res.end(JSON.stringify({ ok: true, key, value: next.data[key] }));
    void refreshOpenPages();
  }
  async function writeRead(req, res, port2) {
    if (!originAllowed(req.headers.origin, port2) || !tokenMatches(req.headers[CONFIG_TOKEN_HEADER])) {
      respond(res, 403, "forbidden");
      return;
    }
    const type = req.headers["content-type"];
    if (typeof type !== "string" || type.split(";")[0]?.trim().toLowerCase() !== "application/json") {
      respond(res, 415, "content-type must be application/json");
      return;
    }
    const body = await readLimitedBody(req);
    if (body === null) {
      respond(res, 413, "request body too large");
      return;
    }
    let parsed2;
    try {
      parsed2 = JSON.parse(body);
    } catch {
      respond(res, 400, "invalid JSON");
      return;
    }
    if (parsed2 === null || typeof parsed2 !== "object" || Array.isArray(parsed2)) {
      respond(res, 400, "expected a JSON object");
      return;
    }
    const { dir, id, read } = parsed2;
    if (typeof dir !== "string" || typeof id !== "string" || typeof read !== "boolean") {
      respond(res, 400, "expected { dir, id, read }");
      return;
    }
    if (!/^h[0-9a-f]{12}$/.test(id)) {
      respond(res, 400, "id must be a message id (h plus 12 hex)");
      return;
    }
    const root = await registeredRoot(env, dir);
    if (root === null) {
      respond(res, 403, "not a registered project");
      return;
    }
    try {
      await setMessageRead(root, id, read);
    } catch {
      respond(res, 500, "could not write the read state");
      return;
    }
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store"
    });
    res.end(JSON.stringify({ ok: true, id, read }));
  }
  async function writeInboxDismiss(req, res, port2) {
    if (!originAllowed(req.headers.origin, port2) || !tokenMatches(req.headers[CONFIG_TOKEN_HEADER])) {
      respond(res, 403, "forbidden");
      return;
    }
    const type = req.headers["content-type"];
    if (typeof type !== "string" || type.split(";")[0]?.trim().toLowerCase() !== "application/json") {
      respond(res, 415, "content-type must be application/json");
      return;
    }
    const body = await readLimitedBody(req);
    if (body === null) {
      respond(res, 413, "request body too large");
      return;
    }
    let parsed2;
    try {
      parsed2 = JSON.parse(body);
    } catch {
      respond(res, 400, "invalid JSON");
      return;
    }
    if (parsed2 === null || typeof parsed2 !== "object" || Array.isArray(parsed2)) {
      respond(res, 400, "expected a JSON object");
      return;
    }
    const { dir, sessionId, at } = parsed2;
    if (typeof dir !== "string" || typeof sessionId !== "string" || typeof at !== "string") {
      respond(res, 400, "expected { dir, sessionId, at }");
      return;
    }
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(sessionId) || Number.isNaN(Date.parse(at))) {
      respond(res, 400, "sessionId or at is not valid");
      return;
    }
    const root = await registeredRoot(env, dir);
    if (root === null) {
      respond(res, 403, "not a registered project");
      return;
    }
    try {
      await dismissInboxSession(root, sessionId, at);
    } catch {
      respond(res, 500, "could not write the inbox state");
      return;
    }
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store"
    });
    res.end(JSON.stringify({ ok: true, sessionId, at }));
  }
  async function mapViewWrite(req, res, port2) {
    if (!originAllowed(req.headers.origin, port2) || !tokenMatches(req.headers[CONFIG_TOKEN_HEADER])) {
      respond(res, 403, "forbidden");
      return null;
    }
    const type = req.headers["content-type"];
    if (typeof type !== "string" || type.split(";")[0]?.trim().toLowerCase() !== "application/json") {
      respond(res, 415, "content-type must be application/json");
      return null;
    }
    const raw = await readLimitedBody(req);
    if (raw === null) {
      respond(res, 413, "request body too large");
      return null;
    }
    let parsed2;
    try {
      parsed2 = JSON.parse(raw);
    } catch {
      respond(res, 400, "invalid JSON");
      return null;
    }
    if (parsed2 === null || typeof parsed2 !== "object" || Array.isArray(parsed2)) {
      respond(res, 400, "expected a JSON object");
      return null;
    }
    const body = parsed2;
    if (typeof body.dir !== "string") {
      respond(res, 400, "dir is required");
      return null;
    }
    const root = await registeredRoot(env, body.dir);
    if (root === null) {
      respond(res, 403, "not a registered project");
      return null;
    }
    return { root, body };
  }
  async function writeRowWidth(req, res, port2) {
    const write = await mapViewWrite(req, res, port2);
    if (write === null) return;
    const { sessionId, width } = write.body;
    if (typeof sessionId !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/.test(sessionId) || width !== null && !(typeof width === "number" && Number.isInteger(width) && width > 0 && width <= 1e4)) {
      respond(res, 400, "expected { dir, sessionId, width }");
      return;
    }
    try {
      await setRowWidth(write.root, sessionId, width);
    } catch {
      respond(res, 500, "could not write the row width");
      return;
    }
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store"
    });
    res.end(JSON.stringify({ ok: true, sessionId, width }));
  }
  async function writeOpenSessions(req, res, port2) {
    const write = await mapViewWrite(req, res, port2);
    if (write === null) return;
    const { open } = write.body;
    if (!Array.isArray(open) || open.length > MAX_OPEN || !open.every((id) => typeof id === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(id))) {
      respond(res, 400, "expected { dir, open: [session ids] }");
      return;
    }
    try {
      await setOpenSessions(write.root, open);
    } catch {
      respond(res, 500, "could not write the open sessions");
      return;
    }
    res.writeHead(200, {
      "content-type": "application/json",
      "cache-control": "no-store"
    });
    res.end(JSON.stringify({ ok: true, open }));
  }
  async function handle(req, res) {
    const port2 = server.address()?.port ?? opts.port;
    if (req.method === "POST") {
      if (!hostAllowed(req.headers.host, port2)) {
        respond(res, 403, "forbidden");
        return;
      }
      const url3 = new URL(req.url ?? "/", `http://${HOST}:${port2}`);
      if (url3.pathname === "/api/stop") {
        if (req.headers.origin !== void 0) {
          respond(res, 403, "forbidden");
          return;
        }
        respond(res, 200, "stopping");
        void close();
        return;
      }
      if (url3.pathname === "/api/read") {
        await writeRead(req, res, port2);
        return;
      }
      if (url3.pathname === "/api/inbox/dismiss") {
        await writeInboxDismiss(req, res, port2);
        return;
      }
      if (url3.pathname === "/api/row-width") {
        await writeRowWidth(req, res, port2);
        return;
      }
      if (url3.pathname === "/api/open-sessions") {
        await writeOpenSessions(req, res, port2);
        return;
      }
      if (url3.pathname !== "/api/config") {
        respond(res, 405, "method not allowed");
        return;
      }
      await writeConfig(req, res, port2);
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      respond(res, 405, "method not allowed");
      return;
    }
    if (!hostAllowed(req.headers.host, port2)) {
      respond(res, 403, "forbidden");
      return;
    }
    const url2 = new URL(req.url ?? "/", `http://${HOST}:${port2}`);
    if (url2.pathname === "/api/diff") {
      if (req.method !== "GET") {
        respond(res, 405, "method not allowed");
        return;
      }
      await readDiff(req, res, port2, url2);
      return;
    }
    if (url2.pathname === "/api/map-view") {
      if (req.method !== "GET") {
        respond(res, 405, "method not allowed");
        return;
      }
      await readMapViewRequest(req, res, port2, url2);
      return;
    }
    if (url2.pathname === "/api/config") {
      if (req.method !== "GET") {
        respond(res, 405, "method not allowed");
        return;
      }
      await readConfig(req, res, port2);
      return;
    }
    if (url2.pathname === MERMAID_PATH) {
      await serveMermaid(res, opts.mermaidFile ?? mermaidFile());
      return;
    }
    if (url2.pathname === "/health") {
      res.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store"
      });
      res.end(
        JSON.stringify({ ok: true, name: "cogit", home: globalPaths(env).base, version: VERSION })
      );
      return;
    }
    const target = await pageTarget(env, url2);
    if (!target) {
      respond(res, 404, "not found");
      return;
    }
    if (url2.pathname === "/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive"
      });
      res.write("retry: 1000\n\n");
      const page = watched(target.file, target.dir, target.root);
      page.clients.add(res);
      res.on("error", () => page.clients.delete(res));
      openPages += 1;
      clearIdle();
      if (target.root !== void 0) startTranscriptWatch();
      req.on("close", () => {
        page.clients.delete(res);
        release(target.file, page);
        openPages = Math.max(0, openPages - 1);
        if (!mapPagesOpen()) stopTranscriptWatch();
        if (openPages === 0) scheduleIdle(idleMs);
      });
      return;
    }
    let html;
    try {
      html = await readFile3(target.file, "utf8");
      if (target.root !== void 0 && builtBy(html) !== VERSION) {
        await buildProject({ dir: target.root, io: buildIo, quiet: true }).catch(() => void 0);
        html = await readFile3(target.file, "utf8");
      }
    } catch {
      respond(res, 404, "not found");
      return;
    }
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    });
    res.end(req.method === "HEAD" ? void 0 : injectTokenMeta(injectLiveMeta(html), token));
  }
  await new Promise((done, fail) => {
    const onError = (err) => fail(err);
    server.once("error", onError);
    server.listen(opts.port, hostname, () => {
      server.off("error", onError);
      done();
    });
  });
  const port = server.address().port;
  const url = `http://${hostname}:${port}`;
  function close() {
    if (closing) return closing;
    closing = (async () => {
      clearIdle();
      stopTranscriptWatch();
      for (const page of pages.values()) {
        page.watcher?.close();
        if (page.timer !== null) clearTimeout(page.timer);
        for (const client of page.clients) client.end();
        page.clients.clear();
      }
      pages.clear();
      await new Promise((done) => server.close(() => done()));
      resolveClosed();
    })();
    return closing;
  }
  scheduleIdle(idleMs);
  return { port, host: hostname, url, close, closed };
}
async function serverVersion(url, env) {
  try {
    const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(500) });
    if (!response.ok) return void 0;
    const body = await response.json();
    if (body.name !== "cogit" || body.home !== globalPaths(env).base) return void 0;
    return typeof body.version === "string" ? body.version : "";
  } catch {
    return void 0;
  }
}
async function stopStaleServer(url, env) {
  const version = await serverVersion(url, env);
  if (version === void 0 || version === VERSION) return false;
  try {
    const response = await fetch(`${url}/api/stop`, {
      method: "POST",
      signal: AbortSignal.timeout(500)
    });
    if (!response.ok) return false;
  } catch {
    return false;
  }
  for (let i = 0; i < 20; i++) {
    await delay(50);
    if (await serverVersion(url, env) === void 0) return true;
  }
  return false;
}
async function checkHealth(url, env) {
  try {
    const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(500) });
    if (!response.ok) return false;
    const body = await response.json();
    return body.name === "cogit" && body.home === globalPaths(env).base && body.version === VERSION;
  } catch {
    return false;
  }
}
var systemSpawn = (command, args, options) => spawn2(command, args, options);
function spawnServerProcess(cli, port, env, spawnFn = systemSpawn) {
  spawnFn(process.execPath, [cli, "serve", "--port", String(port)], {
    detached: true,
    stdio: "ignore",
    env: { ...env, COGIT_DISABLE: "1" }
  }).unref();
}
function delay(ms) {
  return new Promise((done) => setTimeout(done, ms));
}
async function ensureServer(env, deps = {}) {
  const { serverPort } = await loadConfig(env);
  const base = `http://${HOST}:${serverPort}`;
  const health = deps.health ?? checkHealth;
  if (await health(base, env)) return base;
  await (deps.stopStale ?? stopStaleServer)(base, env);
  const cli = deps.cli ?? process.argv[1] ?? fileURLToPath(import.meta.url);
  (deps.spawn ?? spawnServerProcess)(cli, serverPort, env);
  const deadline = Date.now() + (deps.waitMs ?? START_WAIT_MS);
  while (Date.now() < deadline) {
    await delay(50);
    if (await health(base, env)) return base;
  }
  return null;
}

// src/commands/doctor.ts
var MIN_NODE = "22.13.0";
var RETENTION_FLOOR = 90;
function once(fn) {
  let cached;
  return () => cached ??= fn();
}
function transcriptDirName(dir) {
  return dir.replace(/[^a-zA-Z0-9]/g, "-");
}
async function projectTranscripts(root, worktree, agent3, env) {
  const names = /* @__PURE__ */ new Set([transcriptDirName(root)]);
  if (worktree !== void 0) names.add(transcriptDirName(worktree));
  const all = await agent3.collectTranscripts(env);
  return new Map([...all].filter(([, file]) => names.has(basename2(dirname2(file)))));
}
async function newestTranscript(transcripts, skip) {
  const dated = [];
  for (const [id, file] of transcripts) {
    const info = await stat3(file).catch(() => void 0);
    if (info !== void 0) dated.push({ id, file, mtime: info.mtimeMs });
  }
  dated.sort((a, b) => b.mtime - a.mtime);
  for (const { id, file } of dated) {
    if (!await skip(file)) return { id, file };
  }
  return void 0;
}
async function unrecordedTail(root, sessionId, file, agent3) {
  const turns = hashTurns(sessionId, await agent3.readConversation(file));
  const loaded = await loadSession(root, sessionId);
  let recorded = /* @__PURE__ */ new Set();
  if (loaded.found && loaded.ok) {
    const upgraded = upgradeSessionIds(loaded.data, turns);
    const events = await readEvents(root, sessionId);
    recorded = new Set(applyEvents(upgraded.nodes, events).map((node) => node.id));
  }
  return turns.filter((turn) => !isRecorded(recorded, turn)).length;
}
function formatCheck(check) {
  const head = `${check.status.padEnd(5)}${check.message}`;
  return check.fix === void 0 ? head : `${head} \xB7 fix: ${check.fix}`;
}
function closePassError(log2) {
  const sections = [];
  for (const line2 of log2.split("\n")) {
    if (line2.startsWith("--- ")) sections.push({ header: line2.slice(4), body: [] });
    else sections.at(-1)?.body.push(line2);
  }
  const passes = sections.filter((section) => /\bbackfill\b/.test(section.header));
  const last = passes.at(-1);
  if (last === void 0) return void 0;
  const line = last.body.find((text) => /^\s*error:/i.test(text));
  if (line === void 0) return void 0;
  const id = last.header.split(/\s+/)[2];
  return { ...id === void 0 ? {} : { sessionId: id }, line: line.trim() };
}
async function readDetachedLog(root) {
  const text = await readFile4(projectPaths(root).detachedLog, "utf8").catch(() => "");
  return text.slice(-64 * 1024);
}
function nodeCheck(node = process.versions.node) {
  if (compareVersions(node, MIN_NODE) < 0)
    return {
      id: "node",
      status: "fail",
      message: `Node ${node} is older than ${MIN_NODE}`,
      fix: `install Node ${MIN_NODE} or newer (https://nodejs.org)`
    };
  return { id: "node", status: "ok", message: `Node ${node}, cogit ${package_default.version}` };
}
var CHECK_SPECS = [
  { id: "node", run: async () => nodeCheck() },
  {
    id: "plugin",
    run: async (ctx) => {
      const installed = await ctx.agent.readPluginInstalled(ctx.env);
      if (installed !== true)
        return {
          id: "plugin",
          status: "fail",
          message: "the Claude Code plugin is not installed, so nothing is recorded",
          fix: ctx.agent.installCommand
        };
      const enabled = await ctx.agent.readPluginEnabled(ctx.env, ctx.root);
      if (enabled === void 0)
        return {
          id: "plugin",
          status: "warn",
          message: "could not read Claude Code's settings to see whether the plugin is enabled",
          fix: "check ~/.claude/settings.json is a valid JSON object"
        };
      if (!enabled)
        return {
          id: "plugin",
          status: "warn",
          message: "the plugin is installed but not enabled, so sessions here record nothing",
          fix: "cogit init --project-settings"
        };
      const version = await ctx.agent.readPluginVersion(ctx.env);
      if (version === void 0)
        return {
          id: "plugin",
          status: "warn",
          message: "the plugin is installed and enabled, but its version is unknown",
          fix: "claude plugin update cogit@cogit"
        };
      const notice = versionNotice(version, package_default.version);
      if (notice !== void 0) return { id: "plugin", status: "warn", message: notice };
      return {
        id: "plugin",
        status: "ok",
        message: `the plugin is installed, enabled and at the CLI's version (${version})`
      };
    }
  },
  {
    id: "git",
    run: async (ctx) => {
      const gitRoot = await ctx.gitRoot();
      if (gitRoot === void 0)
        return {
          id: "git",
          status: "fail",
          message: `${ctx.root} is not inside a git repository`,
          fix: "git init"
        };
      const name = await gitUserName(ctx.root, ctx.env);
      const email = await gitUserEmail(ctx.root, ctx.env);
      if (name !== void 0 && email !== void 0)
        return {
          id: "git",
          status: "ok",
          message: `git identity: ${name} <${email}>`
        };
      const missing = [
        name === void 0 ? "user.name" : "",
        email === void 0 ? "user.email" : ""
      ].filter((key) => key !== "").join(" and ");
      const fix = (name === void 0 ? 'git config --global user.name "Your Name"' : "") + (name === void 0 && email === void 0 ? " && " : "") + (email === void 0 ? "git config --global user.email you@example.com" : "");
      return {
        id: "git",
        status: "warn",
        message: `git has no ${missing}; sessions are credited to the OS user and two people with one name read as one`,
        fix
      };
    }
  },
  {
    id: "project",
    run: async (ctx) => {
      const project = await ctx.project();
      if (!project.found)
        return {
          id: "project",
          status: "fail",
          message: `${projectPaths(ctx.root).project} is missing`,
          fix: "cogit init"
        };
      if (!project.ok)
        return {
          id: "project",
          status: "fail",
          message: `${projectPaths(ctx.root).project}: ${project.error}`,
          fix: "fix or remove the file, then run `cogit init`"
        };
      const hooks = await hookProblems(ctx);
      if (hooks.length > 0)
        return {
          id: "project",
          status: "warn",
          message: `initialized, but ${hooks.join(", ")}`,
          fix: "cogit hooks install"
        };
      return {
        id: "project",
        status: "ok",
        message: `initialized as "${project.data.name}"; the git hooks are current`
      };
    }
  },
  {
    id: "skill",
    run: async (ctx) => {
      const allowed = await ctx.agent.readSkillAllowed(ctx.env);
      if (allowed === void 0)
        return {
          id: "skill",
          status: "warn",
          message: "could not read Claude Code's permissions",
          fix: `check ~/.claude/settings.json is valid, or add ${ctx.agent.skillRule} to permissions.allow`
        };
      if (!allowed)
        return {
          id: "skill",
          status: "warn",
          message: `${ctx.agent.skillRule} is not allowed, so the agent asks before each record update`,
          fix: "cogit init --allow-skill"
        };
      return {
        id: "skill",
        status: "ok",
        message: `${ctx.agent.skillRule} is allowed`
      };
    }
  },
  {
    id: "transcripts",
    run: async (ctx) => {
      const transcripts = await ctx.transcripts();
      const retention2 = await ctx.agent.readRetention(ctx.env);
      if (transcripts.size === 0)
        return {
          id: "transcripts",
          status: "warn",
          message: "no Claude Code transcripts for this project; start a session here",
          fix: "claude"
        };
      if (retention2 === void 0)
        return {
          id: "transcripts",
          status: "warn",
          message: `${transcripts.size} transcript(s) found, but Claude Code's retention could not be read`,
          fix: "cogit init --retention 90"
        };
      if (retention2 < RETENTION_FLOOR)
        return {
          id: "transcripts",
          status: "warn",
          message: `${transcripts.size} transcript(s) found; Claude Code deletes them after ${retention2} days`,
          fix: "cogit init --retention 90"
        };
      return {
        id: "transcripts",
        status: "ok",
        message: `${transcripts.size} transcript(s) found; Claude Code keeps them ${retention2} days`
      };
    }
  },
  {
    id: "sessions",
    run: async (ctx) => {
      const sessions = await ctx.sessions();
      const transcripts = await ctx.transcripts();
      const { recordHeadless } = await ctx.config();
      const newest = await newestTranscript(
        transcripts,
        (file) => recordHeadless ? Promise.resolve(false) : ctx.agent.isHeadlessTranscript(file)
      );
      const tail = newest === void 0 ? void 0 : await unrecordedTail(ctx.root, newest.id, newest.file, ctx.agent);
      const pending = newest !== void 0 && tail !== void 0 && tail > 0 ? newest : void 0;
      if (sessions.length === 0)
        return {
          id: "sessions",
          status: "warn",
          message: pending === void 0 ? "no session recorded yet" : `no session recorded yet; transcript ${pending.id} has ${tail} message(s) with no node`,
          ...pending === void 0 ? {} : { fix: `cogit backfill ${pending.id} --tail` }
        };
      const latest = sessions.reduce((a, b) => a.updatedAt >= b.updatedAt ? a : b);
      if (pending !== void 0)
        return {
          id: "sessions",
          status: "warn",
          message: `${sessions.length} session(s) recorded, newest ${latest.updatedAt}; the newest transcript has ${tail} message(s) with no node yet`,
          fix: `cogit backfill ${pending.id} --tail`
        };
      return {
        id: "sessions",
        status: "ok",
        message: `${sessions.length} session(s) recorded, newest ${latest.updatedAt}; the newest transcript is fully recorded`
      };
    }
  },
  {
    id: "server",
    run: async (ctx) => {
      const port = (await ctx.config()).serverPort;
      const url = `http://127.0.0.1:${port}`;
      if (await checkHealth(url, ctx.env))
        return {
          id: "server",
          status: "ok",
          message: `the map server answers on ${url}`
        };
      return {
        id: "server",
        status: "warn",
        message: `no map server on ${url} (the saved map file still opens)`,
        fix: "cogit open ."
      };
    }
  },
  {
    id: "detached",
    run: async (ctx) => {
      const error = closePassError(await readDetachedLog(ctx.root));
      if (error === void 0)
        return {
          id: "detached",
          status: "ok",
          message: "the last close pass left no error"
        };
      return {
        id: "detached",
        status: "warn",
        message: `the last close pass wrote: ${error.line}`,
        fix: error.sessionId === void 0 ? "cogit backfill <session-id> --tail --close" : `cogit backfill ${error.sessionId} --tail --close`
      };
    }
  }
];
async function hookProblems(ctx) {
  const gitRoot = await ctx.gitRoot();
  if (gitRoot === void 0) return ["the git hooks are not installed"];
  const dir = await gitHooksDir(gitRoot);
  if (dir === void 0) return ["the git hooks directory could not be found"];
  const problems = [];
  for (const event of ["prepare-commit-msg", "pre-commit", "post-commit"]) {
    const text = await readFile4(join3(dir, event), "utf8").catch(() => void 0);
    if (text === void 0 || !text.includes(BLOCK_START)) {
      problems.push(`the ${event} hook is missing`);
      continue;
    }
    const block = /# >>> cogit[\s\S]*?# <<< cogit/.exec(text)?.[0] ?? "";
    const command = hookBlock(event, ctx.root, null).split("\n")[2] ?? "";
    if (!block.split("\n").includes(command)) problems.push(`the ${event} hook is outdated`);
  }
  return problems;
}
async function doctor(opts) {
  const { io } = opts;
  const agent3 = defaultAgent();
  const resolved = await resolveProjectRoot(opts.dir);
  const root = resolved.root;
  const ctx = {
    root,
    env: io.env,
    agent: agent3,
    gitRoot: once(() => findGitRoot(root)),
    project: once(() => loadProject(root)),
    sessions: once(() => loadAllSessions(root, io.warn)),
    transcripts: once(() => projectTranscripts(root, resolved.worktree?.path, agent3, io.env)),
    config: once(() => loadConfig(io.env))
  };
  const checks = [];
  for (const spec of CHECK_SPECS) {
    try {
      checks.push(await spec.run(ctx));
    } catch (err) {
      checks.push({
        id: spec.id,
        status: "fail",
        message: `the check could not run: ${err.message}`
      });
    }
  }
  const report = {
    ok: checks.every((check) => check.status !== "fail"),
    checks
  };
  if (opts.json === true) {
    io.out(JSON.stringify(report, null, 2));
  } else {
    for (const check of checks) io.out(formatCheck(check));
  }
  return report;
}

// src/commands/hooks.ts
async function initializedRoot(dir) {
  const { root } = await resolveProjectRoot(dir);
  const project = await loadProject(root);
  if (!project.found) throw new CliError(`${root} is not initialized; run \`cogit init\` first`);
  if (!project.ok) throw new CliError(project.error);
  return root;
}
async function hooksInstall(dir, io) {
  const root = await initializedRoot(dir);
  const added = await installGitHooks(root);
  io.out(
    added.length === 0 ? "The cogit hook blocks are already current." : `Added the cogit block to: ${added.join(", ")}`
  );
}
async function hooksUninstall(dir, io) {
  const root = await initializedRoot(dir);
  const removed = await uninstallGitHooks(root);
  io.out(
    removed.length === 0 ? "No cogit hook blocks to remove." : `Removed the cogit block from: ${removed.join(", ")}`
  );
}

// src/commands/init.ts
import { mkdir as mkdir2 } from "fs/promises";
import { basename as basename3, resolve as resolve6 } from "path";
var agent2 = defaultAgent();
var RETENTION_FLOOR2 = 90;
async function bestEffort(io, what, fn) {
  try {
    await fn();
    return true;
  } catch (err) {
    io.warn(`${what}: ${err.message}`);
    return false;
  }
}
async function askRetention(io, opts) {
  const current = await agent2.readRetention(io.env);
  if (current === void 0) {
    io.warn("could not read Claude Code settings; transcript retention left unchanged");
    return;
  }
  let choice = opts.retention;
  if (choice === void 0) {
    if (current >= RETENTION_FLOOR2) {
      io.out(`Claude Code keeps transcripts for ${current} days.`);
      return;
    }
    const picked = await io.prompt.select(
      `Claude Code deletes transcripts after ${current} days${current === agent2.defaultRetention ? " (its default)" : ""}. Older sessions can then no longer be resumed or backfilled. Keep them longer?`,
      [
        { value: "keep", name: `Keep ${current} days` },
        { value: "90", name: "90 days" },
        { value: "365", name: "1 year" },
        { value: "3650", name: "10 years" }
      ],
      "keep"
    );
    choice = picked === "keep" ? "keep" : Number(picked);
  }
  if (choice === "keep" || choice === current) return;
  const { file, backup } = await agent2.setRetention(choice, io.env, io.now());
  io.out(`Set cleanupPeriodDays to ${choice} in ${file}${backup ? ` (backup: ${backup})` : ""}.`);
}
async function askSkillPermission(io, opts) {
  const allowed = await agent2.readSkillAllowed(io.env);
  if (allowed === void 0) {
    io.warn(
      `could not read Claude Code permissions; add ${agent2.skillRule} to permissions.allow yourself`
    );
    return;
  }
  if (allowed) return;
  const allow = opts.allowSkill ?? await io.prompt.confirm(
    `Let the agent update the lineage record without asking each time? (adds ${agent2.skillRule} to your Claude Code permissions)`,
    true
  );
  if (!allow) {
    io.out(
      `Claude Code will ask before each lineage update; allow ${agent2.skillRule} to stop that.`
    );
    return;
  }
  const { file, backup } = await agent2.allowSkill(io.env, io.now());
  io.out(`Allowed ${agent2.skillRule} in ${file}${backup ? ` (backup: ${backup})` : ""}.`);
}
async function askProjectSettings(io, root, opts) {
  const done = await agent2.readProjectSetup(root);
  if (done === void 0) {
    io.warn("could not read the project's Claude Code settings; leaving them unchanged");
    return;
  }
  if (done) return;
  const add = opts.projectSettings ?? await io.prompt.confirm(
    "Turn the plugin on for everyone who opens this project, and stop a session that started without it? (writes .claude/settings.json; commit it to share)",
    true
  );
  if (!add) return;
  await bestEffort(io, "could not update the project's Claude Code settings", async () => {
    const { file } = await agent2.writeProjectSetup(root);
    io.out(`Enabled the plugin and the missing-plugin guard in ${file}.`);
  });
}
async function askLanguage(io, opts) {
  const firstRun = !(await readJson(globalPaths(io.env).config)).found;
  if (!firstRun && opts.language === void 0) return;
  let language = opts.language;
  if (language === void 0) {
    const mode = await io.prompt.select(
      "Language for session summaries?",
      [
        { value: "auto", name: "Same as the conversation (auto)" },
        { value: "fixed", name: "Always one language" }
      ],
      "auto"
    );
    language = mode === "auto" ? "auto" : await io.prompt.input("Which language?", "English");
  }
  const lang = language;
  await bestEffort(
    io,
    "could not save global config",
    () => updateConfig((c) => ({ ...c, language: lang }), io.env)
  );
}
async function register(io, root, name) {
  await bestEffort(
    io,
    "could not register the project in the global panel",
    () => updateRegistry(
      (r) => r.projects.some((p) => p.path === root) ? r : { ...r, projects: [...r.projects, { path: root, name, addedAt: io.now() }] },
      io.env
    )
  );
}
async function applyGitPolicy(io, root, policy, shareConversations) {
  const added = [];
  await bestEffort(io, "could not update .gitignore", async () => {
    added.push(...await ensureGitignore(root, policy));
  });
  if (added.length > 0) io.out(`Added to .gitignore: ${added.join(", ")}`);
  await bestEffort(
    io,
    "could not write .cogit/.gitignore",
    () => ensureCogitGitignore(root, policy, shareConversations)
  );
  await bestEffort(io, "could not install the git hooks", () => installGitHooks(root));
}
async function refreshGitIntegration(io, root) {
  if (await findGitRoot(root) === void 0) return;
  await bestEffort(io, "could not refresh the git integration", async () => {
    if (!await cogitIgnored(root))
      await refreshCogitGitignore(root, (await loadConfig(io.env)).shareConversations);
    await installGitHooks(root);
  });
}
async function init(dir, opts, io) {
  const root = resolve6(dir);
  await migrateProject(root);
  const existing = await loadProject(root);
  if (existing.found) {
    if (!existing.ok) throw new CliError(`${projectPaths(root).project}: ${existing.error}`);
    await register(io, root, existing.data.name);
    if (opts.allowSkill !== void 0) await askSkillPermission(io, opts);
    if (opts.retention !== void 0) await askRetention(io, opts);
    if (opts.projectSettings !== void 0) await askProjectSettings(io, root, opts);
    await bestEffort(io, "could not refresh the project's Claude Code settings", async () => {
      const file = await agent2.refreshProjectSetup(root);
      if (file) io.out(`Updated the cogit guard and marketplace in ${file}.`);
    });
    await refreshGitIntegration(io, root);
    io.out(`Already initialized: ${existing.data.name} (${root})`);
    return;
  }
  if (await findGitRoot(root) === void 0)
    throw new CliError(
      `${root} is not in a git repository; cogit ties its record to your commits, so run \`git init\` first`
    );
  if ((await sessionIdentity(root, io.env)).authorEmail === void 0)
    io.warn(
      "git has no user.email here; cogit tells people's sessions apart by it, so set one: git config --global user.email you@example.com"
    );
  const name = opts.name ?? await io.prompt.input("Project name?", basename3(root));
  const config = await loadConfig(io.env);
  const policy = opts.git ?? await io.prompt.select(
    "Commit the session records?",
    [
      { value: "commit", name: "Yes, commit session records (local state stays ignored)" },
      { value: "ignore", name: "No, keep .cogit/ out of git (private)" }
    ],
    config.gitPolicy
  );
  await askRetention(io, opts);
  await askSkillPermission(io, opts);
  await askProjectSettings(io, root, opts);
  await askLanguage(io, opts);
  await updateProject(root, (cur) => cur ?? { schema: 1, name });
  await mkdir2(projectPaths(root).sessions, { recursive: true });
  await applyGitPolicy(io, root, policy, config.shareConversations);
  await register(io, root, name);
  io.out(
    config.shareConversations ? "Conversations are stored in .cogit/conversations/ (shared through git: shareConversations is on)." : "Conversations are stored in .cogit/conversations/ (kept out of git; turn on shareConversations to share them)."
  );
  io.out(`Initialized ${name} in ${projectPaths(root).base}`);
  const installed = await agent2.readPluginInstalled(io.env).catch(() => void 0);
  io.out(
    installed ? "Next: work with Claude Code here, then run `cogit open` to see the map." : `Next: install the Claude Code plugin (\`${agent2.installCommand}\`), then run \`cogit open\` after a session.`
  );
}

// src/commands/migrate.ts
import { copyFile, mkdir as mkdir3, readdir as readdir3 } from "fs/promises";
import { join as join4 } from "path";
var BACKUP_DIR = "backup-pre-8.5";
async function migrateIds(dir, io) {
  const { root } = await resolveProjectRoot(dir);
  const paths = projectPaths(root);
  const ids = await listSessionIds(paths.sessions);
  let backedUp = false;
  let migrated = 0;
  let skipped = 0;
  for (const id of ids) {
    const loaded = await loadSession(root, id);
    if (!loaded.found) continue;
    if (!loaded.ok) {
      io.warn(`session ${id}: skipped, ${loaded.error}`);
      skipped += 1;
      continue;
    }
    if (!loaded.data.nodes.some((node) => node.kind === "message")) continue;
    const events = await readEvents(root, id);
    if (events.length > 0) {
      skipped += 1;
      continue;
    }
    const messages = await readSessionMessages(root, id, io.env);
    if (!messages) {
      io.warn(`session ${id}: no transcript or stored conversation, ids left as they are`);
      skipped += 1;
      continue;
    }
    const upgraded = upgradeSessionIds(loaded.data, messages);
    const unmapped = upgraded.nodes.filter(
      (node) => node.kind === "message" && !MESSAGE_HASH.test(node.id)
    );
    if (unmapped.length > 0) {
      io.warn(
        `session ${id}: ${unmapped.length} message(s) have no transcript line, left as they are`
      );
      skipped += 1;
      continue;
    }
    if (!backedUp) {
      await backupRecords(paths.sessions, paths.backup(BACKUP_DIR));
      backedUp = true;
    }
    await updateSession(root, id, async (cur) => {
      const next = upgradeSessionIds(cur ?? loaded.data, messages);
      if ((await readEvents(root, id)).length === 0)
        await appendEvents(root, id, seedEvents(next.nodes, io.now()));
      return next;
    });
    migrated += 1;
  }
  return { migrated, skipped };
}
async function backupRecords(sessions, backup) {
  await mkdir3(backup, { recursive: true });
  for (const entry of await readdir3(sessions)) {
    if (!entry.endsWith(".json") && !entry.endsWith(".events.jsonl")) continue;
    await copyFile(join4(sessions, entry), join4(backup, entry));
  }
}

// src/commands/open.ts
import { spawn as spawn3 } from "child_process";
async function defaultServer(env) {
  try {
    return await ensureServer(env);
  } catch {
    return null;
  }
}
function openerCommand(platform, file) {
  if (platform === "darwin") return { command: "open", args: [file] };
  if (platform === "win32") return { command: "cmd", args: ["/c", "start", "", file] };
  return { command: "xdg-open", args: [file] };
}
var systemSpawn2 = (command, args, options) => spawn3(command, args, options);
function launchFile(file, spawnFn = systemSpawn2) {
  const { command, args } = openerCommand(process.platform, file);
  return new Promise((done) => {
    const child = spawnFn(command, args, { detached: true, stdio: "ignore" });
    child.once("error", () => done(false));
    child.once("spawn", () => {
      child.unref();
      done(true);
    });
  });
}
async function openTarget(target, opts) {
  const { io } = opts;
  const opened = await (opts.launch ?? launchFile)(target);
  if (opened) {
    io.out(`Opened ${target}`);
    return;
  }
  io.out(target);
  io.warn("no application opener found; open it manually");
}
async function openProject2(opts) {
  const { io } = opts;
  const { root } = await resolveProjectRoot(opts.dir);
  await buildProject({
    dir: root,
    io,
    ...opts.templateHtml === void 0 ? {} : { templateHtml: opts.templateHtml }
  });
  const project = await loadProject(root);
  if (project.found && project.ok) await register(io, root, project.data.name);
  const listed = await loadRegistry(io.env).then(
    (r) => r.found && r.ok && r.data.projects.some((p) => p.path === root),
    () => false
  );
  const base = listed ? await (opts.server ?? defaultServer)(io.env) : null;
  if (base) {
    await openTarget(mapPageUrl(base, root), opts);
    return;
  }
  io.warn("could not start the local map server; opened the file instead");
  await openTarget(projectPaths(root).html, opts);
}
async function openPanel(opts) {
  await buildPanel({
    env: opts.io.env,
    io: opts.io,
    ...opts.templateHtml === void 0 ? {} : { templateHtml: opts.templateHtml }
  });
  const base = await (opts.server ?? defaultServer)(opts.io.env);
  if (base) {
    await openTarget(`${base}/`, opts);
    return;
  }
  opts.io.warn("could not start the local map server; opened the file instead");
  await openTarget(globalPaths(opts.io.env).panel, opts);
}

// src/commands/pr.ts
import { execFile as execFile2, spawn as spawn4 } from "child_process";
import { promisify as promisify2 } from "util";
var exec2 = promisify2(execFile2);
var PR_CHAR_CAP = 6e4;
function parsePrCommits(stdout) {
  const out = [];
  for (const line of stdout.split("\n")) {
    const [full, short, at, subject] = line.split("\0");
    if (full === void 0 || !/^[0-9a-f]{40}$/.test(full)) continue;
    if (short === void 0 || short === "") continue;
    out.push({ full, short, at: at ?? "", subject: subject ?? "" });
  }
  return out;
}
async function git(root, args, env) {
  try {
    const { stdout } = await exec2("git", ["-C", root, ...args], { env });
    return String(stdout).trim();
  } catch {
    return void 0;
  }
}
async function revParse(root, ref, env) {
  const out = await git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], env);
  return out !== void 0 && /^[0-9a-f]{40}$/.test(out) ? out : void 0;
}
async function resolvePrBase(root, requested, env) {
  if (requested !== void 0) {
    const commit = await revParse(root, requested, env);
    if (commit === void 0) throw new CliError(`unknown base "${requested}"`);
    return { ref: requested, commit };
  }
  const upstream = await revParse(root, "@{upstream}", env);
  if (upstream !== void 0) {
    const mergeBase = await git(root, ["merge-base", "HEAD", upstream], env);
    if (mergeBase !== void 0 && /^[0-9a-f]{40}$/.test(mergeBase))
      return { ref: "@{upstream}", commit: mergeBase };
  }
  for (const branch of ["main", "master"]) {
    const commit = await revParse(root, `refs/heads/${branch}`, env);
    if (commit !== void 0) return { ref: branch, commit };
  }
  throw new CliError(
    "cannot find a base: no upstream and neither main nor master; pass one, e.g. `cogit pr main`"
  );
}
async function readPrCommits(root, base, head, env) {
  const stdout = await git(
    root,
    ["log", "--reverse", "--format=%H%x00%h%x00%cI%x00%s", `${base}..${head}`],
    env
  );
  return parsePrCommits(stdout ?? "");
}
function oneLine(text) {
  return text.replace(/\s+/g, " ").trim();
}
function titleOf(sessionId, title) {
  return title.trim() === "" ? sessionId : oneLine(title);
}
function labelIndex(label) {
  const match = /^m([1-9][0-9]*)$/.exec(label);
  return match === null ? void 0 : Number(match[1]);
}
function buildPrModel(input) {
  const index = /* @__PURE__ */ new Map();
  for (const entry of input.sessions)
    for (const message of entry.messages)
      if (!index.has(message.id)) index.set(message.id, { entry, message });
  const thoughts = /* @__PURE__ */ new Map();
  const unlinked = [];
  const sessionOrder = [];
  const entries = /* @__PURE__ */ new Map();
  const labels = /* @__PURE__ */ new Map();
  const thoughtCounts = /* @__PURE__ */ new Map();
  const commitCounts = /* @__PURE__ */ new Map();
  for (const commit of input.commits) {
    const id = commit.thought;
    const hit = id === void 0 ? void 0 : index.get(id);
    if (id === void 0 || hit === void 0) {
      unlinked.push({
        full: commit.full,
        short: commit.short,
        subject: commit.subject,
        ...id === void 0 ? {} : { thought: id }
      });
      continue;
    }
    const { session } = hit.entry;
    let thought = thoughts.get(id);
    if (thought === void 0) {
      const message = hit.message;
      thought = {
        id,
        shortId: shortHash(id),
        label: message.label ?? id,
        sessionId: session.sessionId,
        shortSessionId: session.sessionId.slice(0, 8),
        sessionTitle: titleOf(session.sessionId, session.title),
        title: message.title,
        ...message.summary === void 0 ? {} : { summary: message.summary },
        ...message.why === void 0 ? {} : { why: message.why },
        ...message.decidedBy === void 0 ? {} : { decidedBy: message.decidedBy },
        alternatives: message.alternatives ?? [],
        agentDecisions: (message.agentDecisions ?? []).map((decision) => ({
          title: decision.title,
          why: decision.why,
          alternatives: decision.alternatives ?? []
        })),
        commits: []
      };
      thoughts.set(id, thought);
      if (!entries.has(session.sessionId)) {
        sessionOrder.push(session.sessionId);
        entries.set(session.sessionId, hit.entry);
        labels.set(session.sessionId, []);
        thoughtCounts.set(session.sessionId, 0);
        commitCounts.set(session.sessionId, 0);
      }
      thoughtCounts.set(session.sessionId, (thoughtCounts.get(session.sessionId) ?? 0) + 1);
    }
    thought.commits.push(commit);
    labels.get(session.sessionId)?.push(labelIndex(thought.label) ?? 0);
    commitCounts.set(session.sessionId, (commitCounts.get(session.sessionId) ?? 0) + 1);
  }
  const goals = [];
  const seenGoals = /* @__PURE__ */ new Set();
  const sessions = [];
  for (const sessionId of sessionOrder) {
    const entry = entries.get(sessionId);
    if (entry === void 0) continue;
    const session = entry.session;
    const title = titleOf(sessionId, session.title);
    const goal = oneLine(session.status.goal);
    if (goal !== "" && !seenGoals.has(goal)) {
      seenGoals.add(goal);
      goals.push({ text: goal, sessionId, sessionTitle: title });
    }
    const numbers = labels.get(sessionId) ?? [];
    sessions.push({
      sessionId,
      shortId: sessionId.slice(0, 8),
      title,
      startedAt: session.startedAt,
      updatedAt: session.updatedAt,
      from: numbers.length === 0 ? "\u2014" : `m${Math.min(...numbers)}`,
      to: numbers.length === 0 ? "\u2014" : `m${Math.max(...numbers)}`,
      thoughtCount: thoughtCounts.get(sessionId) ?? 0,
      commitCount: commitCounts.get(sessionId) ?? 0
    });
  }
  return {
    base: input.base,
    head: input.head,
    policy: input.policy,
    goals,
    sessions,
    thoughts: [...thoughts.values()],
    unlinked
  };
}
function alternativeLine(alt, indent = "") {
  const why2 = alt.why.trim() === "" ? "" : ` \u2014 ${oneLine(alt.why)}`;
  return `${indent}- considered and rejected: ${oneLine(alt.option)}${why2}`;
}
function decisionLines(thought) {
  const lines = [];
  if (thought.why !== void 0 && thought.why.trim() !== "")
    lines.push(`- Why: ${oneLine(thought.why)}`);
  if (thought.decidedBy !== void 0) lines.push(`- Decided by: ${thought.decidedBy}`);
  for (const alt of thought.alternatives) lines.push(alternativeLine(alt));
  for (const decision of thought.agentDecisions) {
    const why2 = decision.why.trim() === "" ? "" : ` \u2014 ${oneLine(decision.why)}`;
    lines.push(`- agent decision: ${oneLine(decision.title)}${why2}`);
    for (const alt of decision.alternatives) lines.push(alternativeLine(alt, "  "));
  }
  return lines;
}
function formatPr(model, opts) {
  const lines = ["## Goal"];
  if (model.goals.length === 0) {
    lines.push("_No session goal was recorded._");
  } else {
    for (const goal of model.goals)
      lines.push(`- ${oneLine(goal.text)} \u2014 ${goal.sessionTitle} (${goal.sessionId.slice(0, 8)})`);
  }
  lines.push("", "## Sessions");
  if (model.sessions.length === 0) {
    lines.push("_No recorded session is behind these commits._");
  } else {
    lines.push("Open a whole session with `cogit log --session <id>` or the map.");
    for (const session of model.sessions) {
      const range = session.from === session.to ? session.from : `${session.from}\u2013${session.to}`;
      lines.push(
        `- ${session.title} (${session.shortId}) \xB7 ${range} \xB7 ${stamp(session.startedAt)} \u2192 ${stamp(session.updatedAt)}`
      );
    }
  }
  lines.push("", "## Thoughts");
  if (model.thoughts.length === 0) {
    lines.push("_No recorded thought is behind these commits._");
  } else {
    for (const thought of model.thoughts) {
      lines.push(
        "",
        `### \`${thought.shortId}\` ${thought.shortSessionId}:${thought.label} \u2014 ${oneLine(thought.title)}`
      );
      if (opts.includeSummaries && thought.summary !== void 0 && thought.summary.trim() !== "")
        lines.push("", oneLine(thought.summary));
      const decisions = decisionLines(thought);
      if (decisions.length > 0) lines.push("", ...decisions);
      lines.push("", "Commits:");
      for (const commit of thought.commits) {
        lines.push(`- \`${commit.short}\` ${oneLine(commit.subject)}`);
        if (opts.includeFiles) for (const file of commit.files) lines.push(`  - \`${file}\``);
      }
    }
  }
  lines.push("", "## Commits without a recorded thought");
  if (model.unlinked.length === 0) {
    lines.push("_None: every commit carries a recorded thought._");
  } else {
    for (const commit of model.unlinked) {
      const thought = commit.thought === void 0 ? "" : ` \u2014 thought \`${commit.thought}\` not recorded yet`;
      lines.push(`- \`${commit.short}\` ${oneLine(commit.subject)}${thought}`);
    }
  }
  lines.push("", "## Dig deeper");
  lines.push(
    "- `cogit show <message-hash>` opens a thought: its decisions, the options it rejected, and the conversation turn for whoever has it locally.",
    "- `cogit show <sha>` opens the thought behind a commit.",
    model.policy === "ignore" ? "- This project keeps its record out of git, so these hashes resolve only on the author's machine; ask the author to run `cogit show`." : "- This branch commits its record, so a reviewer who checks it out gets the same `cogit show` output."
  );
  const dropped = opts.dropped ?? [];
  if (dropped.length > 0) {
    const names = dropped.map((item) => item === "files" ? "file lists" : "summaries");
    const text = names.length === 1 ? names[0] : `${names[0]} and ${names[1]}`;
    lines.push("", `_Left out to stay under the size cap: ${text}._`);
  }
  return lines.join("\n");
}
function renderPr(model, cap = PR_CHAR_CAP) {
  const levels = [
    { includeFiles: true, includeSummaries: true, dropped: [] },
    { includeFiles: false, includeSummaries: true, dropped: ["files"] },
    { includeFiles: false, includeSummaries: false, dropped: ["files", "summaries"] }
  ];
  for (const level of levels) {
    const text = formatPr(model, level);
    if (text.length <= cap) return { text, dropped: level.dropped, truncated: false };
  }
  const full = formatPr(model, levels[2]);
  const note = "\n\n_Truncated to fit the size cap; file lists and summaries were left out. Open a thought with `cogit show` for the rest._";
  if (note.length >= cap)
    return { text: note.slice(0, cap), dropped: ["files", "summaries"], truncated: true };
  return {
    text: full.slice(0, cap - note.length) + note,
    dropped: ["files", "summaries"],
    truncated: true
  };
}
var CLIPBOARD_TOOLS = [
  ["wl-copy", []],
  ["xclip", ["-selection", "clipboard"]],
  ["pbcopy", []],
  ["clip", []]
];
function pipe(command, args, text, env) {
  return new Promise((resolve7) => {
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      resolve7(ok);
    };
    const child = spawn4(command, args, { env, stdio: ["pipe", "ignore", "ignore"] });
    child.on("error", () => done(false));
    child.on("close", (code) => done(code === 0));
    child.stdin.on("error", () => done(false));
    child.stdin.end(text);
  });
}
async function copyToClipboard(text, env = process.env) {
  for (const [command, args] of CLIPBOARD_TOOLS) {
    if (await pipe(command, args, text, env)) return true;
  }
  return false;
}
async function pr(opts) {
  const root = await openProject(opts.dir);
  const gitRoot = await findGitRoot(root);
  if (gitRoot === void 0) throw new CliError("not in a git repository");
  const env = opts.io.env;
  const head = await revParse(gitRoot, "HEAD", env);
  if (head === void 0) throw new CliError("HEAD has no commits yet");
  const base = await resolvePrBase(gitRoot, opts.base, env);
  const commits = await readPrCommits(gitRoot, base.commit, head, env);
  const sessions = await loadEffectiveSessions(root, opts.io);
  const trailers = commits.length === 0 ? /* @__PURE__ */ new Map() : await readThoughtTrailers(gitRoot, {
    env,
    since: earliestSessionStart(sessions.map((entry) => entry.session))
  });
  const files = commits.length === 0 ? /* @__PURE__ */ new Map() : await readCommitFiles(
    gitRoot,
    commits.map((commit) => commit.full)
  );
  const model = buildPrModel({
    base,
    head,
    policy: await cogitIgnored(root) ? "ignore" : "commit",
    sessions,
    commits: commits.map((commit) => {
      const thought = trailers.get(commit.full);
      return {
        ...commit,
        files: files.get(commit.full) ?? [],
        ...thought === void 0 ? {} : { thought }
      };
    })
  });
  const rendered = renderPr(model, opts.cap ?? PR_CHAR_CAP);
  if (opts.copy === true && !await copyToClipboard(rendered.text, env)) {
    opts.io.warn(
      "could not copy: no clipboard tool found (wl-copy, xclip, pbcopy or clip); the Markdown is on stdout"
    );
  }
  if (opts.json === true) {
    opts.io.out(
      JSON.stringify(
        {
          ...model,
          rendered: { dropped: rendered.dropped, truncated: rendered.truncated }
        },
        null,
        2
      )
    );
    return model;
  }
  for (const line of rendered.text.split("\n")) opts.io.out(line);
  return model;
}

// src/view/search.ts
function foldChar(ch) {
  return ch.normalize("NFKD").replace(new RegExp("\\p{M}+", "gu"), "").replace(/[Iı]/g, "i").toLowerCase();
}
function fold(text) {
  return foldChar(text.normalize("NFC"));
}
function normalizeQuery(query) {
  return fold(query).replace(/\s+/g, " ").trim();
}
function originalIndex(text, index) {
  let folded = 0;
  let offset = 0;
  for (const ch of text) {
    if (folded >= index) return offset;
    folded += foldChar(ch).length;
    offset += ch.length;
  }
  return text.length;
}
function excerptFor(text, needle, max = 120) {
  if (needle === "") return null;
  const at = fold(text).indexOf(needle);
  if (at < 0) return null;
  const start = originalIndex(text, at);
  const end = originalIndex(text, at + needle.length);
  const before = Math.min(start, 40);
  const after = Math.max(0, max - before - (end - start));
  const left = start - before;
  const right = Math.min(text.length, end + after);
  const oneLine3 = text.slice(left, right).replace(/\s+/g, " ").trim();
  return `${left > 0 ? "\u2026" : ""}${oneLine3}${right < text.length ? "\u2026" : ""}`;
}
var NO_HIT = /* @__PURE__ */ Symbol("no-hit");
function matchText(text, needle, field) {
  if (text === void 0 || text === "") return NO_HIT;
  const excerpt = excerptFor(text, needle);
  return excerpt === null ? NO_HIT : { field, excerpt };
}
function messageHit(message, needle) {
  for (const text of [
    message.title,
    message.summary,
    message.why,
    ...(message.alternatives ?? []).flatMap((alt) => [alt.option, alt.why]),
    ...message.work ?? [],
    ...(message.agentDecisions ?? []).flatMap((decision) => [
      decision.title,
      decision.why,
      ...(decision.alternatives ?? []).flatMap((alt) => [alt.option, alt.why])
    ])
  ]) {
    const hit = matchText(text, needle, "title");
    if (hit !== NO_HIT) return hit;
  }
  return NO_HIT;
}
function branchHit(message, needle) {
  if (message.branch === void 0) return NO_HIT;
  for (const text of [
    message.branch.title,
    message.branch.asked,
    message.branch.outcome,
    message.branch.open
  ]) {
    const hit = matchText(text, needle, "branch");
    if (hit !== NO_HIT) return hit;
  }
  return NO_HIT;
}
function conversationHit(turn, needle) {
  if (turn === void 0) return NO_HIT;
  const hit = matchText(turn.text, needle, "conversation");
  if (hit !== NO_HIT) return hit;
  for (const reply of turn.replies) {
    const replyHit = matchText(reply, needle, "conversation");
    if (replyHit !== NO_HIT) return replyHit;
  }
  return NO_HIT;
}
function turnOf(chat, message) {
  return chat?.find(
    (turn) => turn.id === message.id || turn.label !== void 0 && turn.label === message.label
  );
}
function hitOf(message, chat, needle) {
  const own = messageHit(message, needle);
  if (own !== NO_HIT) return own;
  const branch = branchHit(message, needle);
  if (branch !== NO_HIT) return branch;
  return conversationHit(turnOf(chat, message), needle);
}
function sessionHit(source, needle) {
  const status = source.status;
  const statusTexts = status === void 0 ? [] : [status.goal, ...status.done, ...status.pending.map((item) => item.text), status.next];
  for (const text of [source.title, ...statusTexts]) {
    const hit = matchText(text, needle, "session");
    if (hit !== NO_HIT) return hit;
  }
  return NO_HIT;
}
function timeOf(value) {
  if (value === null || value === void 0) return Number.NEGATIVE_INFINITY;
  const at = Date.parse(value);
  return Number.isNaN(at) ? Number.NEGATIVE_INFINITY : at;
}
function labelNumber(label) {
  const match = label === null ? null : /^m([1-9][0-9]*)$/.exec(label);
  return match === null ? -1 : Number(match[1]);
}
function searchSources(sources, query) {
  const needle = normalizeQuery(query);
  if (needle === "") return [];
  const hits = [];
  for (const source of sources) {
    const sessionLevel = sessionHit(source, needle);
    if (sessionLevel !== NO_HIT) {
      const newest = source.messages[source.messages.length - 1];
      hits.push({
        sessionId: source.sessionId,
        sessionTitle: source.title,
        messageId: null,
        label: null,
        at: source.updatedAt ?? source.startedAt ?? newest?.at ?? null,
        field: sessionLevel.field,
        excerpt: sessionLevel.excerpt
      });
    }
    for (const message of source.messages) {
      const hit = hitOf(message, source.chat, needle);
      if (hit === NO_HIT) continue;
      hits.push({
        sessionId: source.sessionId,
        sessionTitle: source.title,
        messageId: message.id,
        label: message.label ?? null,
        at: message.at ?? null,
        field: hit.field,
        excerpt: hit.excerpt
      });
    }
  }
  return hits.sort(
    (a, b) => timeOf(b.at) - timeOf(a.at) || a.sessionId.localeCompare(b.sessionId) || labelNumber(b.label) - labelNumber(a.label)
  );
}

// src/commands/search.ts
function oneLine2(text) {
  return text.replace(/\s+/g, " ").trim();
}
function formatSearch(model) {
  if (model.hits.length === 0) return [`No matches for "${model.query}".`];
  return model.hits.flatMap((hit) => {
    const title = oneLine2(hit.sessionTitle) || hit.sessionId;
    const hash = hit.messageId === null ? "(session)" : shortHash(hit.messageId);
    return [
      `${hash}  ${(hit.label ?? "\u2014").padEnd(4)}  ${stamp(hit.at ?? void 0)}  ${hit.field}  ${title}`,
      `  ${hit.excerpt}`
    ];
  });
}
async function search(opts) {
  const query = opts.text.replace(/\s+/g, " ").trim();
  if (normalizeQuery(opts.text) === "")
    throw new CliError('search needs some text, e.g. `cogit search "where did we discuss X"`');
  const root = await openProject(opts.dir);
  const sessions = await loadEffectiveSessions(root, opts.io);
  const selected = opts.session === void 0 ? sessions : selectSessions(sessions, opts.session);
  const sources = selected.map(({ session, messages, turns }) => ({
    sessionId: session.sessionId,
    title: session.title,
    status: session.status,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    messages,
    ...turns === null ? {} : {
      chat: turns.map((turn) => ({
        id: turn.hash,
        ...turn.label === void 0 ? {} : { label: turn.label },
        at: turn.at,
        text: turn.text,
        replies: turn.replies,
        tools: turn.tools
      }))
    }
  }));
  const all = searchSources(sources, opts.text);
  const hits = opts.limit === void 0 ? all : all.slice(0, opts.limit);
  const model = { query, hits };
  if (opts.json === true) {
    opts.io.out(JSON.stringify(model, null, 2));
    return model;
  }
  for (const line of formatSearch(model)) opts.io.out(line);
  return model;
}

// src/commands/shape.ts
function needsShape(node) {
  if (node.kind !== "message" || node.commits === void 0 || node.commits.length === 0)
    return false;
  if (node.shape === void 0) return true;
  return node.shape.commits.length < node.commits.length;
}
function shapeCandidates(nodes) {
  return nodes.map((node, index) => {
    const parsed2 = Date.parse(node.at ?? node.addedAt ?? "");
    return { node, index, at: Number.isNaN(parsed2) ? index : parsed2 };
  }).filter(({ node }) => needsShape(node)).sort((a, b) => b.at - a.at || b.index - a.index).map(({ node }) => node);
}
async function shapeMessage(dir, sessionId, io, opts = {}) {
  const { root } = await resolveProjectRoot(dir);
  const project = await loadProject(root);
  if (!project.found) throw new CliError(`${root} is not initialized; run \`cogit init\` first`);
  if (!project.ok) throw new CliError(project.error);
  const config = await loadConfig(io.env);
  if (opts.dryRun === true) {
    if (opts.commit === void 0) throw new CliError("--dry-run needs --commit <sha>");
    await previewCommit(root, opts.commit, config, io);
    return;
  }
  if (!config.shapes) {
    io.out("shapes are off");
    return;
  }
  if (config.recorder === "agent") return;
  if (opts.commit !== void 0) {
    await shapeCommit(root, opts.commit, config, io);
    return;
  }
  const id = sessionId ?? (await readSessionHead(root))?.sessionId;
  if (id === void 0) {
    io.out("no session to shape");
    return;
  }
  await underLock(root, id, io, () => runShape(root, id, config, io));
}
async function underLock(root, sessionId, io, fn) {
  try {
    await withLock(projectPaths(root).lock(`shape-${sessionId}`), fn, { timeoutMs: 0 });
  } catch (err) {
    if (!(err instanceof LockBusyError)) throw err;
    io.out(`a shape for ${sessionId} is already being written`);
  }
}
async function shapeCommit(root, ref, config, io) {
  const gitRoot = await findGitRoot(root);
  if (gitRoot === void 0) return;
  const commit = await resolveCommit(gitRoot, ref);
  if (commit === void 0) {
    io.out(`no commit ${ref}`);
    return;
  }
  const thought = await readCommitThought(root, commit, io.env);
  if (thought === void 0) {
    io.out(`no shape for ${commit.slice(0, 7)}: no Thought trailer`);
    return;
  }
  const sessions = await loadAllSessions(root, () => {
  });
  const session = sessions.find(
    (s) => s.nodes.some((n) => n.kind === "message" && n.id === thought)
  );
  if (session === void 0) {
    await enqueueShape(root, commit, thought);
    io.out(`queued ${commit.slice(0, 7)} until ${thought} is recorded`);
    return;
  }
  await dequeueShape(root, commit);
  await underLock(root, session.sessionId, io, async () => {
    const fresh = await loadSession(root, session.sessionId);
    if (!fresh.found || !fresh.ok) return;
    const [withTrailers] = attachThoughtTrailers(
      [fresh.data],
      await readThoughtTrailers(root, { env: io.env })
    );
    const node = withTrailers?.nodes.find((n) => n.id === thought);
    if (node === void 0 || !needsShape(node)) return;
    await shapeNode(root, gitRoot, session.sessionId, node, config, io);
  });
}
async function previewCommit(root, ref, config, io) {
  const gitRoot = await findGitRoot(root);
  const commit = gitRoot === void 0 ? void 0 : await resolveCommit(gitRoot, ref);
  if (gitRoot === void 0 || commit === void 0) throw new CliError(`no commit ${ref}`);
  const thought = await readCommitThought(root, commit, io.env);
  const sessions = await loadAllSessions(root, () => {
  });
  const recorded = sessions.flatMap((session) => session.nodes).find((node2) => node2.kind === "message" && node2.id === thought);
  const subject = (await readCommitSubjects(gitRoot, [commit])).get(commit) ?? commit.slice(0, 7);
  const node = {
    ...recorded ?? {
      id: thought ?? "h000000000000",
      kind: "message",
      title: subject,
      parent: null
    },
    commits: [commit]
  };
  await shapeNode(root, gitRoot, void 0, node, config, io);
}
async function runShape(root, sessionId, config, io) {
  const loaded = await loadSession(root, sessionId);
  if (!loaded.found || !loaded.ok) return;
  const gitRoot = await findGitRoot(root);
  if (gitRoot === void 0) return;
  const [session] = attachThoughtTrailers(
    [loaded.data],
    await readThoughtTrailers(root, { env: io.env })
  );
  for (const node of shapeCandidates(session?.nodes ?? [])) {
    if (await shapeNode(root, gitRoot, sessionId, node, config, io)) return;
  }
}
async function shapeNode(root, gitRoot, sessionId, node, config, io) {
  const hashes = node.commits ?? [];
  const [changes, subjects] = await Promise.all([
    readCommitChanges(gitRoot, hashes),
    readCommitSubjects(gitRoot, hashes)
  ]);
  const commits = hashes.flatMap((hash) => {
    const change = changes.get(hash);
    if (change === void 0) return [];
    return [
      {
        hash: change.full,
        subject: subjects.get(hash),
        added: change.added,
        removed: change.removed,
        files: change.files
      }
    ];
  });
  const verdict = shapeWanted(commits);
  if (!verdict.wanted) {
    io.out(`no shape for ${node.id}: ${verdict.reason}`);
    return false;
  }
  const patches = await readCommitPatches(gitRoot, hashes, SHAPE_DIFF_LIMIT);
  const prompt = shapePrompt({
    node,
    commits,
    diff: patches.diff,
    diffTruncated: patches.truncated,
    language: config.language
  });
  const stdout = await runClaude(prompt, config.sideModel, io.env);
  const answer = parseShapeAnswer(resultText(stdout)) ?? { tools: [], commits: [] };
  if (sessionId === void 0) {
    io.out(JSON.stringify({ tools: validateShapeTools(answer.tools) }, null, 2));
    return true;
  }
  const payload = {
    sessionId,
    nodes: [
      {
        id: node.id,
        kind: "message",
        title: node.title,
        // The trailer-linked commits count too, so the message stops waiting
        // once its Shape covers them.
        shape: { tools: answer.tools, commits: hashes.slice(-20) }
      }
    ]
  };
  await sessionWrite({ dir: root, by: "side" }, io, async () => JSON.stringify(payload));
  return true;
}

// src/program.ts
function retention(value) {
  if (value === "keep") return value;
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1) throw new InvalidArgumentError("days (>= 1) or keep");
  return days;
}
function positiveCount(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1)
    throw new InvalidArgumentError("a positive whole number");
  return count;
}
function examples(...commands) {
  return `
Examples:
${commands.map((command) => `  $ ${command}`).join("\n")}
`;
}
function createProgram(makeIo = processIo, deps = {}) {
  const program2 = new Command().name("cogit").description(package_default.description).version(package_default.version);
  const run = (fn) => async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      if (!(err instanceof CliError)) throw err;
      program2.error(`error: ${err.message}`, { exitCode: 1 });
    } finally {
      for (const line of takeMigrationWarnings()) makeIo(false).warn(line);
    }
  };
  program2.command("blame").description("show which recorded messages produced the code in a file or line").helpGroup("Read:").argument("<target>", "file, or file:line").argument("[dir]", "project directory", ".").option("-C, --dir <dir>", "project directory (same as the positional)").addHelpText("after", examples("cogit blame src/auth.ts:42", "cogit blame src/auth.ts")).action(
    run(async (target, dir, opts) => {
      await blame({ dir: opts.dir ?? dir, target, io: makeIo(false) });
    })
  );
  program2.command("why").description("show the decisions and rejected options behind a file or a line").helpGroup("Read:").argument("<file>", "file (or file:line) to look up, relative to where you are (or to [dir])").argument("[dir]", "project directory; by default the nearest one above you").option("-C, --dir <dir>", "project directory (same as the positional)").option("--line <n>", "the line to look up (same as file:line)", positiveCount).addHelpText(
    "after",
    examples(
      "cogit why src/auth.ts",
      "cogit why src/auth.ts:42",
      "cogit why src/auth.ts ../my-app"
    )
  ).action(
    run(async (file, dir, opts) => {
      const project = opts.dir ?? dir;
      await why({
        ...project === void 0 ? { cwd: process.cwd() } : { dir: project },
        file,
        ...opts.line === void 0 ? {} : { line: opts.line },
        io: makeIo(false)
      });
    })
  );
  program2.command("log").description("print the recorded lineage, newest first").helpGroup("Read:").argument("[dir]", "project directory", ".").option("-C, --dir <dir>", "project directory (same as the positional)").option("--session <id>", "only this session (id or prefix)").option("-n, --number <count>", "at most this many messages", positiveCount).option("--branches", "only the branch summaries (the compressed view)").option("--file <path>", "only messages that touched this file (its history)").option("--unread", "unread messages with commits, most code first").option("--json", "print JSON instead of text").addHelpText(
    "after",
    examples("cogit log -n 10", "cogit log --file src/auth.ts", "cogit log --unread")
  ).action(
    run(
      async (dir, opts) => {
        const target = opts.dir ?? dir;
        if (opts.unread === true) {
          await logUnread({ dir: target, io: makeIo(false), json: opts.json === true });
          return;
        }
        if (opts.file !== void 0) {
          await logFile({
            dir: target,
            file: opts.file,
            io: makeIo(false),
            json: opts.json === true
          });
          return;
        }
        await log({
          dir: target,
          io: makeIo(false),
          session: opts.session,
          limit: opts.number,
          branchesOnly: opts.branches === true,
          json: opts.json === true
        });
      }
    )
  );
  program2.command("show").description("print one recorded message by hash, <session-id>:mN or commit hash").helpGroup("Read:").argument("<ref>", "message hash, <session-id-prefix>:mN, or a commit hash").argument("[dir]", "project directory", ".").option("-C, --dir <dir>", "project directory (same as the positional)").option("--no-chat", "leave out the conversation turn").option("--json", "print JSON instead of text").addHelpText("after", examples("cogit show h3f9c2a1b4d6e", "cogit show a1b2c3d")).action(
    run(
      async (ref, dir, opts) => {
        const io = makeIo(false);
        const model = await show({ dir: opts.dir ?? dir, ref, io, chat: opts.chat !== false });
        if (opts.json === true) io.out(JSON.stringify(model, null, 2));
        else for (const line of formatShow(model)) io.out(line);
      }
    )
  );
  program2.command("search").description("find recorded messages, branch summaries and conversation text").helpGroup("Read:").argument("<text>", "text to look for").argument("[dir]", "project directory", ".").option("-C, --dir <dir>", "project directory (same as the positional)").option("--session <id>", "only this session (id or prefix)").option("-n, --number <count>", "at most this many hits", positiveCount).option("--json", "print JSON instead of text").addHelpText(
    "after",
    examples('cogit search "refresh token"', "cogit search auth --session 9c32ab18")
  ).action(
    run(
      async (text, dir, opts) => {
        await search({
          dir: opts.dir ?? dir,
          io: makeIo(false),
          text,
          session: opts.session,
          limit: opts.number,
          json: opts.json === true
        });
      }
    )
  );
  program2.command("pr").description("print a review-ready description of a branch from the thoughts behind it").helpGroup("Read:").argument("[base]", "base ref; default: the upstream's merge base, else main, else master").option("-C, --dir <dir>", "project directory", ".").option("--json", "print JSON instead of Markdown").option("--copy", "also copy the Markdown to the clipboard").addHelpText(
    "after",
    "\nExamples:\n  $ cogit pr\n  $ cogit pr main --copy\n  $ cogit pr origin/main --json\n\nPrints only the record's titles, summaries and decisions \u2014 never the conversation\ntext or your raw prompts, because the PR may be public.\n"
  ).action(
    run(
      async (base, opts) => {
        await pr({
          dir: opts.dir,
          base,
          io: makeIo(false),
          json: opts.json === true,
          copy: opts.copy === true
        });
      }
    )
  );
  program2.command("open").description("build and open a project map, or the global panel without a directory").helpGroup("Map:").argument("[dir]", "project directory; omit to open the global panel").addHelpText("after", examples("cogit open", "cogit open ../my-app")).action(
    run(async (dir) => {
      const io = makeIo(false);
      const launch = deps.launch === void 0 ? {} : { launch: deps.launch };
      const server = deps.server === void 0 ? {} : { server: deps.server };
      if (dir === void 0) {
        await openPanel({ io, ...launch, ...server });
        return;
      }
      await openProject2({ dir, io, ...launch, ...server });
    })
  );
  program2.command("init").description("set up .cogit/ in a project and register it").helpGroup("Set up:").argument("[dir]", "project directory", ".").option("--name <name>", "project name").addOption(
    new Option("--git <policy>", "commit or ignore .cogit/").choices(["ignore", "commit"])
  ).option("--language <lang>", 'summary language: "auto" or a language').option("--retention <days>", 'Claude Code transcript retention, or "keep"', retention).option("--allow-skill", "let the agent run the lineage skill without asking").option("--no-allow-skill", "leave Claude Code's permissions unchanged").option(
    "--project-settings",
    "enable the plugin for this project and stop sessions that start without it"
  ).option("--no-project-settings", "leave the project's .claude/settings.json unchanged").option("-y, --yes", "accept defaults for every question").addHelpText("after", examples("cogit init", "cogit init ../my-app --git commit --yes")).action(
    run(async (dir, opts) => {
      const { yes, ...rest } = opts;
      if (yes) rest.allowSkill ??= false;
      if (yes) rest.projectSettings ??= false;
      await init(dir, rest, makeIo(!yes && process.stdin.isTTY === true));
    })
  );
  program2.command("doctor").description("check why the map may be empty; one line per check, with the fix").helpGroup("Set up:").argument("[dir]", "project directory", ".").option("-C, --dir <dir>", "project directory (same as the positional)").option("--json", "print the checks as JSON").addHelpText("after", examples("cogit doctor", "cogit doctor ../my-app --json")).action(async (dir, opts) => {
    const report = await doctor({
      dir: opts.dir ?? dir,
      io: makeIo(false),
      json: opts.json === true
    });
    if (!report.ok) {
      const setCode = deps.exitCode ?? ((code) => {
        process.exitCode = code;
      });
      setCode(1);
    }
  });
  program2.command("build").description("regenerate .cogit/map.html").helpGroup("Map:").argument("[dir]", "project directory", ".").option("--quiet", "write the map without printing a success line").addHelpText("after", examples("cogit build", "cogit build ../my-app --quiet")).action(
    run(async (dir, opts) => {
      await buildProject({ dir, io: makeIo(false), quiet: opts.quiet === true });
    })
  );
  const config = program2.command("config").description("read or change global settings").helpGroup("Set up:").addHelpText(
    "after",
    `${examples(
      "cogit config get language",
      "cogit config set recorder mixed",
      "cogit config set sideEveryTurns 3"
    )}

Settings (the same explanations the panel's ? shows):
${configHelpLines().join("\n")}`
  );
  config.command("get").argument("[key]").action(run(async (key) => configGet(key, makeIo(false))));
  config.command("set").argument("<key>").argument("<value>").action(run(async (key, value) => configSet(key, value, makeIo(false))));
  config.command("git").description("show, or switch to commit or ignore, this project's session records (story 9.3)").argument("[policy]", "commit or ignore; without it, shows the current policy").argument("[dir]", "project directory", ".").action(
    run(async (policy, dir) => {
      if (policy === void 0) return configGitShow(dir, makeIo(false));
      if (policy !== "commit" && policy !== "ignore")
        throw new CliError(`invalid git policy "${policy}"; use commit or ignore`);
      await configGit(dir, policy, makeIo(false));
    })
  );
  config.command("hint-off").description("stop the SessionStart setup hint in a project").argument("[dir]", "project directory", ".").action(run(async (dir) => configHintOff(dir, makeIo(false))));
  config.command("hint-on").description("show the SessionStart setup hint again in a project, or everywhere").argument("[dir]", "project directory", ".").option("--all", "turn the hint back on for every project").action(
    run(
      async (dir, opts) => configHintOn(dir, { all: opts.all === true }, makeIo(false))
    )
  );
  config.command("prune").description("remove registered projects whose directory no longer exists").option("--dry-run", "list what would be removed without changing the registry").action(
    run(
      async (opts) => configPrune({ dryRun: opts.dryRun === true }, makeIo(false))
    )
  );
  program2.command("shape").description("write the Shape of the newest message that landed commits (side model)").helpGroup("Agent:").argument("[session-id]", "session id; defaults to the session in .cogit/HEAD").option("--commit <sha>", "shape the message this commit's Thought trailer names").option("--dry-run", "with --commit: print the Shape instead of saving it").option("-C, --dir <dir>", "project directory", ".").addHelpText(
    "after",
    examples("cogit shape", "cogit shape 9c32ab18", "cogit shape --commit HEAD")
  ).action(
    run(
      async (sessionId, opts) => shapeMessage(opts.dir, sessionId, makeIo(false), {
        commit: opts.commit,
        dryRun: opts.dryRun
      })
    )
  );
  program2.command("backfill").description("record the user messages a session has not summarized yet").helpGroup("Agent:").argument("<session-id>", "session id").option("-C, --dir <dir>", "project directory", ".").option("--tail", "only this session's messages that have no node yet").option(
    "--close",
    "then run the session-end pass: threads, parents, branch summaries and where it left off"
  ).addHelpText(
    "after",
    examples("cogit backfill 9c32ab18 --tail", "cogit backfill 9c32ab18 --tail --close")
  ).action(
    run(async (sessionId, opts) => {
      if (opts.tail !== true)
        throw new CliError(
          "backfill of past sessions is not available yet; run `cogit backfill <session-id> --tail`"
        );
      await backfillTail(opts.dir, sessionId, makeIo(false), { close: opts.close === true });
    })
  );
  const session = program2.command("session").description("session records (used by the agent skill)").helpGroup("Agent:").addHelpText(
    "after",
    examples("cogit session show 9c32ab18", "cogit session write --file inbox.json")
  );
  session.command("write").description("merge session JSON from stdin into .cogit/sessions/").option("-C, --dir <dir>", "project directory", ".").option("-f, --file <file>", "read JSON from a file instead of stdin").option("--consume", "delete the file once the record is saved").option("--by <who>", "who writes: agent (default) or side (fills only empty fields)").action(
    run(async (opts) => {
      if (opts.by !== void 0 && opts.by !== "agent" && opts.by !== "side")
        throw new CliError('--by must be "agent" or "side"');
      const { by, ...rest } = opts;
      await sessionWrite({ ...rest, ...by === void 0 ? {} : { by } }, makeIo(false));
    })
  );
  session.command("show").description("print the compact record the agent skill updates, as JSON").argument("<id>", "session id").option("-C, --dir <dir>", "project directory", ".").option("--full", "print every recorded message and the parent candidates").action(
    run(
      async (id, opts) => sessionShow(opts.dir, id, makeIo(false), { full: opts.full === true })
    )
  );
  const hooks = program2.command("hooks").description("manage the git hooks cogit adds to a project").helpGroup("Set up:").addHelpText("after", examples("cogit hooks install", "cogit hooks uninstall"));
  hooks.command("install").description("add or refresh the cogit block in this project's git hooks").argument("[dir]", "project directory", ".").action(run(async (dir) => hooksInstall(dir, makeIo(false))));
  hooks.command("uninstall").description("remove only the cogit block from the git hooks it installed").argument("[dir]", "project directory", ".").action(run(async (dir) => hooksUninstall(dir, makeIo(false))));
  program2.command("hook").description("run one of the plugin or git hooks cogit installs (never blocks)").helpGroup("Agent:").argument("<event>", "hook event, e.g. stop, sessionstart, pre-commit").argument("[args...]", "arguments git passed to its hook: $1, $2, \u2026").option("-C, --dir <dir>", "project directory (git hooks pass theirs)").allowExcessArguments(true).addHelpText("after", examples("cogit hook stop", "cogit hook pre-commit --dir ../my-app")).action(async (event, args, opts) => {
    const io = makeIo(false);
    if (isGitHookEvent(event)) {
      try {
        await runGitHook(event, opts.dir ?? process.cwd(), io.env, args, new Date(io.now()));
      } catch {
      }
      return;
    }
    const input = await (deps.stdin ?? readStdin)();
    const out = await runHook(event, input, io.env, io.now(), io.warn);
    if (out !== void 0) io.out(out);
  });
  program2.command("serve", { hidden: true }).description("run the local map server that `open` uses").option("--port <port>", "port to bind (default: serverPort from config)").action(
    run(async (opts) => {
      const io = makeIo(false);
      const port = opts.port === void 0 ? (await loadConfig(io.env)).serverPort : Number(opts.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new CliError(`invalid port: ${String(opts.port)}`);
      try {
        await startMapServer({ env: io.env, port });
      } catch (err) {
        throw new CliError(`could not start the map server: ${err.message}`);
      }
    })
  );
  program2.command("migrate", { hidden: true }).description("give old records stable message ids and an events file").argument("[dir]", "project directory", ".").action(
    run(async (dir) => {
      const io = makeIo(false);
      const result = await migrateIds(dir, io);
      io.out(
        `Migrated ${result.migrated} session(s); ${result.skipped} skipped (already migrated or unmappable).`
      );
    })
  );
  program2.command("record-commit", { hidden: true }).description("commit the session record files without touching other staged changes").argument("<session-id>", "session id").option("-C, --dir <dir>", "project directory", ".").action(
    run(async (sessionId, opts) => {
      await maybeAutoCommit(opts.dir, sessionId, makeIo(false).env);
    })
  );
  program2.addHelpText("after", "\nDocs: https://github.com/erensrtky/cogit#readme\n");
  return program2;
}

// src/cli.ts
await migrateGlobal();
for (const line of takeMigrationWarnings()) process.stderr.write(`warning: ${line}
`);
exitOnClosedPipe();
await createProgram().parseAsync(process.argv);
