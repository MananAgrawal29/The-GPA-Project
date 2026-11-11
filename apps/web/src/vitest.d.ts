import "@testing-library/jest-dom";

declare global {
  namespace Vi {
    interface Assertion<T> {
      toBeInTheDocument(): T;
      toBeVisible(): T;
      toBeDisabled(): T;
      toBeEnabled(): T;
      toBeChecked(): T;
      toHaveAttribute(name: string, value?: string): T;
      toHaveClass(className: string): T;
      toHaveValue(value: string | number): T;
      toHaveTextContent(text: string | RegExp): T;
      toHaveFocus(): T;
      toHaveFormValues(values: Record<string, unknown>): T;
    }
  }
}
