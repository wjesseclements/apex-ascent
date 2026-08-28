import { render, screen } from '@testing-library/react';
import { App } from './App';
import { useTransport } from './store/transport';

describe('App', () => {
  it('renders the replay layout without autoloading in tests', () => {
    useTransport.setState({ cars: [], focusIndex: 0, track: null, loadError: null });
    render(<App autoload={false} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Watch the policy drive.');
    expect(screen.getByRole('img', { name: 'track replay' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /on its training track/ })).toBeInTheDocument();
    expect(screen.getByLabelText('open trajectory file')).toBeInTheDocument();
  });
});
