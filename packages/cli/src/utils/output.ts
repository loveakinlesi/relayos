import chalk from "chalk";

export function print(message = ""): void {
  console.log(message);
}

export function printError(message: string): void {
  console.error(chalk.red(message));
}

export function printInfo(message: string): void {
  console.info(chalk.gray(message));
}

export function printMuted(message: string): void {
  console.log(chalk.gray(message));
}

export function printSuccess(message: string): void {
  console.log(chalk.green(message));
}

export function printWarning(message: string): void {
  console.log(chalk.yellow(message));
}

export function printHeader(message: string): void {
  console.log(chalk.blue(message));
}

export function printAccent(message: string): void {
  console.log(chalk.cyan(message));
}
