import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('renders the placeholder page with headline and token swatches', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'A PPO agent learns to drive.',
    );
    expect(screen.getByRole('list', { name: /design tokens/i })).toBeInTheDocument();
    expect(screen.getByText('--color-accent')).toBeInTheDocument();
  });
});
