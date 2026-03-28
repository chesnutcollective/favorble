/**
 * Formula engine for calculated custom fields.
 *
 * Supports:
 * - Arithmetic: +, -, *, /, parentheses
 * - Field references: {field_slug}
 * - Date math: AGE({date_field}) returns years since that date
 * - Conditionals: IF({field} > 10, "high", "low")
 * - String literals: "text"
 * - Number literals: 42, 3.14
 * - Comparisons: >, <, >=, <=, ==, !=
 */

export type FormulaContext = Record<string, string | number | boolean | null>;

type Token =
	| { type: "number"; value: number }
	| { type: "string"; value: string }
	| { type: "field"; value: string }
	| { type: "operator"; value: string }
	| { type: "paren"; value: "(" | ")" }
	| { type: "comma"; value: "," }
	| { type: "function"; value: string };

function tokenize(formula: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;

	while (i < formula.length) {
		const ch = formula[i];

		// Whitespace
		if (/\s/.test(ch)) {
			i++;
			continue;
		}

		// Number
		if (/\d/.test(ch) || (ch === "." && i + 1 < formula.length && /\d/.test(formula[i + 1]))) {
			let num = "";
			while (i < formula.length && (/\d/.test(formula[i]) || formula[i] === ".")) {
				num += formula[i];
				i++;
			}
			tokens.push({ type: "number", value: parseFloat(num) });
			continue;
		}

		// String literal
		if (ch === '"' || ch === "'") {
			const quote = ch;
			i++;
			let str = "";
			while (i < formula.length && formula[i] !== quote) {
				str += formula[i];
				i++;
			}
			i++; // closing quote
			tokens.push({ type: "string", value: str });
			continue;
		}

		// Field reference: {slug}
		if (ch === "{") {
			i++;
			let fieldName = "";
			while (i < formula.length && formula[i] !== "}") {
				fieldName += formula[i];
				i++;
			}
			i++; // closing brace
			tokens.push({ type: "field", value: fieldName.trim() });
			continue;
		}

		// Parentheses
		if (ch === "(" || ch === ")") {
			tokens.push({ type: "paren", value: ch });
			i++;
			continue;
		}

		// Comma
		if (ch === ",") {
			tokens.push({ type: "comma", value: "," });
			i++;
			continue;
		}

		// Operators (multi-char first)
		if (ch === ">" && formula[i + 1] === "=") {
			tokens.push({ type: "operator", value: ">=" });
			i += 2;
			continue;
		}
		if (ch === "<" && formula[i + 1] === "=") {
			tokens.push({ type: "operator", value: "<=" });
			i += 2;
			continue;
		}
		if (ch === "=" && formula[i + 1] === "=") {
			tokens.push({ type: "operator", value: "==" });
			i += 2;
			continue;
		}
		if (ch === "!" && formula[i + 1] === "=") {
			tokens.push({ type: "operator", value: "!=" });
			i += 2;
			continue;
		}
		if (["+", "-", "*", "/", ">", "<"].includes(ch)) {
			tokens.push({ type: "operator", value: ch });
			i++;
			continue;
		}

		// Identifiers (function names like IF, AGE, etc.)
		if (/[a-zA-Z_]/.test(ch)) {
			let ident = "";
			while (i < formula.length && /[a-zA-Z_0-9]/.test(formula[i])) {
				ident += formula[i];
				i++;
			}
			tokens.push({ type: "function", value: ident.toUpperCase() });
			continue;
		}

		// Skip unknown characters
		i++;
	}

	return tokens;
}

type ASTNode =
	| { kind: "number"; value: number }
	| { kind: "string"; value: string }
	| { kind: "field"; name: string }
	| { kind: "binary"; op: string; left: ASTNode; right: ASTNode }
	| { kind: "call"; name: string; args: ASTNode[] }
	| { kind: "unary"; op: string; operand: ASTNode };

class Parser {
	private tokens: Token[];
	private pos: number;

	constructor(tokens: Token[]) {
		this.tokens = tokens;
		this.pos = 0;
	}

	private peek(): Token | undefined {
		return this.tokens[this.pos];
	}

	private consume(): Token {
		return this.tokens[this.pos++];
	}

	parse(): ASTNode {
		const result = this.parseExpression();
		return result;
	}

	private parseExpression(): ASTNode {
		return this.parseComparison();
	}

	private parseComparison(): ASTNode {
		let left = this.parseAddSub();
		while (
			this.peek()?.type === "operator" &&
			["==", "!=", ">", "<", ">=", "<="].includes(this.peek()!.value as string)
		) {
			const op = this.consume().value as string;
			const right = this.parseAddSub();
			left = { kind: "binary", op, left, right };
		}
		return left;
	}

	private parseAddSub(): ASTNode {
		let left = this.parseMulDiv();
		while (
			this.peek()?.type === "operator" &&
			["+", "-"].includes(this.peek()!.value as string)
		) {
			const op = this.consume().value as string;
			const right = this.parseMulDiv();
			left = { kind: "binary", op, left, right };
		}
		return left;
	}

	private parseMulDiv(): ASTNode {
		let left = this.parseUnary();
		while (
			this.peek()?.type === "operator" &&
			["*", "/"].includes(this.peek()!.value as string)
		) {
			const op = this.consume().value as string;
			const right = this.parseUnary();
			left = { kind: "binary", op, left, right };
		}
		return left;
	}

	private parseUnary(): ASTNode {
		if (
			this.peek()?.type === "operator" &&
			this.peek()!.value === "-"
		) {
			this.consume();
			const operand = this.parsePrimary();
			return { kind: "unary", op: "-", operand };
		}
		return this.parsePrimary();
	}

	private parsePrimary(): ASTNode {
		const tok = this.peek();

		if (!tok) {
			return { kind: "number", value: 0 };
		}

		if (tok.type === "number") {
			this.consume();
			return { kind: "number", value: tok.value };
		}

		if (tok.type === "string") {
			this.consume();
			return { kind: "string", value: tok.value };
		}

		if (tok.type === "field") {
			this.consume();
			return { kind: "field", name: tok.value };
		}

		if (tok.type === "function") {
			const name = tok.value;
			this.consume(); // function name
			// Expect '('
			if (this.peek()?.type === "paren" && this.peek()?.value === "(") {
				this.consume(); // (
				const args: ASTNode[] = [];
				while (
					this.peek() &&
					!(this.peek()?.type === "paren" && this.peek()?.value === ")")
				) {
					args.push(this.parseExpression());
					if (this.peek()?.type === "comma") {
						this.consume(); // ,
					}
				}
				if (this.peek()?.type === "paren" && this.peek()?.value === ")") {
					this.consume(); // )
				}
				return { kind: "call", name, args };
			}
			// Bare identifier treated as a field reference
			return { kind: "field", name: name.toLowerCase() };
		}

		if (tok.type === "paren" && tok.value === "(") {
			this.consume(); // (
			const expr = this.parseExpression();
			if (this.peek()?.type === "paren" && this.peek()?.value === ")") {
				this.consume(); // )
			}
			return expr;
		}

		// Fallback
		this.consume();
		return { kind: "number", value: 0 };
	}
}

function evaluate(node: ASTNode, ctx: FormulaContext): string | number | boolean {
	switch (node.kind) {
		case "number":
			return node.value;

		case "string":
			return node.value;

		case "field": {
			const val = ctx[node.name];
			if (val === null || val === undefined) return 0;
			if (typeof val === "string") {
				const num = parseFloat(val);
				return isNaN(num) ? val : num;
			}
			return val;
		}

		case "unary": {
			const operand = evaluate(node.operand, ctx);
			if (node.op === "-") return -(typeof operand === "number" ? operand : 0);
			return operand;
		}

		case "binary": {
			const left = evaluate(node.left, ctx);
			const right = evaluate(node.right, ctx);
			const leftNum = typeof left === "number" ? left : parseFloat(String(left)) || 0;
			const rightNum = typeof right === "number" ? right : parseFloat(String(right)) || 0;

			switch (node.op) {
				case "+":
					// If either side is a string (non-numeric), concatenate
					if (typeof left === "string" && isNaN(parseFloat(left))) {
						return String(left) + String(right);
					}
					return leftNum + rightNum;
				case "-":
					return leftNum - rightNum;
				case "*":
					return leftNum * rightNum;
				case "/":
					return rightNum === 0 ? 0 : leftNum / rightNum;
				case ">":
					return leftNum > rightNum;
				case "<":
					return leftNum < rightNum;
				case ">=":
					return leftNum >= rightNum;
				case "<=":
					return leftNum <= rightNum;
				case "==":
					return left === right || leftNum === rightNum;
				case "!=":
					return left !== right && leftNum !== rightNum;
				default:
					return 0;
			}
		}

		case "call": {
			switch (node.name) {
				case "IF": {
					const condition = evaluate(node.args[0], ctx);
					const isTruthy =
						condition === true ||
						(typeof condition === "number" && condition !== 0) ||
						(typeof condition === "string" && condition !== "" && condition !== "0");
					return isTruthy
						? evaluate(node.args[1], ctx)
						: (node.args[2] ? evaluate(node.args[2], ctx) : 0);
				}
				case "AGE": {
					const dateVal = node.args[0] ? evaluate(node.args[0], ctx) : 0;
					const dateStr = String(dateVal);
					const date = new Date(dateStr);
					if (isNaN(date.getTime())) return 0;
					const now = new Date();
					let age = now.getFullYear() - date.getFullYear();
					const monthDiff = now.getMonth() - date.getMonth();
					if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) {
						age--;
					}
					return age;
				}
				case "ROUND": {
					const val = evaluate(node.args[0], ctx);
					const decimals = node.args[1] ? evaluate(node.args[1], ctx) : 0;
					const numVal = typeof val === "number" ? val : 0;
					const numDec = typeof decimals === "number" ? decimals : 0;
					const factor = Math.pow(10, numDec);
					return Math.round(numVal * factor) / factor;
				}
				case "ABS": {
					const val = evaluate(node.args[0], ctx);
					return Math.abs(typeof val === "number" ? val : 0);
				}
				case "MIN": {
					const vals = node.args.map((a) => {
						const v = evaluate(a, ctx);
						return typeof v === "number" ? v : 0;
					});
					return Math.min(...vals);
				}
				case "MAX": {
					const vals = node.args.map((a) => {
						const v = evaluate(a, ctx);
						return typeof v === "number" ? v : 0;
					});
					return Math.max(...vals);
				}
				case "CONCAT": {
					return node.args.map((a) => String(evaluate(a, ctx))).join("");
				}
				case "DAYS_BETWEEN": {
					const d1 = new Date(String(evaluate(node.args[0], ctx)));
					const d2 = new Date(String(evaluate(node.args[1], ctx)));
					if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
					return Math.round(
						(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24),
					);
				}
				default:
					return 0;
			}
		}
	}
}

/**
 * Evaluate a formula string with the given field values context.
 *
 * @param formula - The formula string, e.g. "{amount} * 0.1" or "IF({age} > 65, 'Senior', 'Standard')"
 * @param context - Map of field slug to field value
 * @returns The computed result as a string
 */
export function evaluateFormula(
	formula: string,
	context: FormulaContext,
): string {
	try {
		if (!formula.trim()) return "";
		const tokens = tokenize(formula);
		const parser = new Parser(tokens);
		const ast = parser.parse();
		const result = evaluate(ast, context);
		if (typeof result === "boolean") return result ? "true" : "false";
		if (typeof result === "number") {
			// Format nicely - avoid floating point artifacts
			return Number.isInteger(result)
				? result.toString()
				: parseFloat(result.toFixed(10)).toString();
		}
		return String(result);
	} catch {
		return "Error";
	}
}

/**
 * Extract field slugs referenced in a formula.
 * Useful for determining dependencies.
 */
export function extractDependencies(formula: string): string[] {
	const deps: string[] = [];
	const regex = /\{([^}]+)\}/g;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(formula)) !== null) {
		const slug = match[1].trim();
		if (!deps.includes(slug)) {
			deps.push(slug);
		}
	}
	return deps;
}
