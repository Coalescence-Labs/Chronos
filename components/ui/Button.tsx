import type { ButtonHTMLAttributes } from "react";
import styles from "./button.module.css";

export type ButtonVariant = "primary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ variant = "primary", className, type, ...rest }: ButtonProps) {
  const classes = [styles.button, styles[variant], className].filter(Boolean).join(" ");
  return <button type={type ?? "button"} className={classes} {...rest} />;
}
