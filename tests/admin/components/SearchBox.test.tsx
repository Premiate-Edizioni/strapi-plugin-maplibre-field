import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { IntlProvider } from 'react-intl';
import { DesignSystemProvider } from '@strapi/design-system';
import SearchBox from '../../../admin/src/components/MapInput/SearchBox';
import { performSearch } from '../../../admin/src/services/geocoder-service';

vi.mock('../../../admin/src/services/geocoder-service', () => ({
  performSearch: vi.fn(),
}));

const poiResult = {
  id: 'poi-skatespots-0',
  place_name: 'Bump dietro Centrale',
  source: 'custom' as const,
  feature: {
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [9.2, 45.48] as [number, number] },
    properties: {
      name: 'Bump dietro Centrale',
      address: 'Via Sammartini, Milano',
      sourceId: 'skatespots',
      sourceLayer: 'Skatespots',
    },
  },
};

const nominatimResult = {
  id: 'nominatim-0',
  place_name: 'Bump, Ladakh, India',
  source: 'nominatim' as const,
  feature: {
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [77.5, 34.1] as [number, number] },
    properties: { name: 'Bump', address: 'Ladakh, India' },
  },
};

const Wrapper = (props: any) => (
  <DesignSystemProvider locale="en">
    <IntlProvider locale="en" messages={{}}>
      <SearchBox {...props} />
    </IntlProvider>
  </DesignSystemProvider>
);

const defaultProps = {
  onSelectResult: vi.fn(),
  nominatimUrl: 'https://nominatim.test',
  poiSources: [
    {
      id: 'skatespots',
      name: 'Skatespots',
      apiUrl: 'https://poi.test/s.geojson',
      color: '#cc0000',
    },
  ],
};

const searchFor = async (text: string) => {
  const input = screen.getByRole('combobox');
  await userEvent.type(input, text);
  fireEvent.keyDown(input, { key: 'Enter' });
  return input;
};

describe('SearchBox', () => {
  beforeEach(() => {
    vi.mocked(performSearch).mockReset();
    defaultProps.onSelectResult.mockClear();
  });

  test('does not search while typing — Nominatim forbids autocomplete querying', async () => {
    vi.mocked(performSearch).mockResolvedValue([]);

    render(<Wrapper {...defaultProps} />);
    await userEvent.type(screen.getByRole('combobox'), 'bump');

    expect(performSearch).not.toHaveBeenCalled();
  });

  test('searches on Enter and lists the results as options', async () => {
    vi.mocked(performSearch).mockResolvedValue([poiResult, nominatimResult] as any);

    render(<Wrapper {...defaultProps} />);
    await searchFor('bump');

    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
    expect(performSearch).toHaveBeenCalledTimes(1);
  });

  test('names the source of each result instead of only colouring it', async () => {
    vi.mocked(performSearch).mockResolvedValue([poiResult, nominatimResult] as any);

    render(<Wrapper {...defaultProps} />);
    await searchFor('bump');

    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
    expect(screen.getByText('Skatespots · Via Sammartini, Milano')).toBeInTheDocument();
    expect(screen.getByText('OpenStreetMap · Ladakh, India')).toBeInTheDocument();
  });

  test('the Nominatim dot takes its grey from the theme, the POI dot from its configuration', async () => {
    vi.mocked(performSearch).mockResolvedValue([poiResult, nominatimResult] as any);

    render(<Wrapper {...defaultProps} />);
    await searchFor('bump');

    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
    const [poiOption, nominatimOption] = screen.getAllByRole('option');
    const dotOf = (option: HTMLElement) =>
      getComputedStyle(option.querySelector('[aria-hidden="true"]')!).backgroundColor;

    // neutral500 in the light theme; a literal grey here would not follow the dark theme.
    expect(dotOf(nominatimOption)).toBe('rgb(142, 142, 169)');
    expect(dotOf(poiOption)).toBe('rgb(204, 0, 0)');
  });

  test('tells the user when a search found nothing', async () => {
    vi.mocked(performSearch).mockResolvedValue([]);

    render(<Wrapper {...defaultProps} />);
    await searchFor('nowhere at all');

    await waitFor(() => expect(screen.getByText(/No results found for/)).toBeInTheDocument());
  });

  test('the chevron runs the search when there is text but no results yet', async () => {
    vi.mocked(performSearch).mockResolvedValue([poiResult] as any);

    render(<Wrapper {...defaultProps} />);
    await userEvent.type(screen.getByRole('combobox'), 'bump');
    // The chevron is aria-hidden by design; it is a redundant affordance for the mouse.
    fireEvent.pointerDown(document.querySelector('button[aria-expanded]')!, { button: 0 });

    await waitFor(() => expect(performSearch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
  });

  test('clicking into an empty box does not open an empty popup', async () => {
    render(<Wrapper {...defaultProps} />);
    const input = screen.getByRole('combobox');

    await userEvent.click(input);

    expect(screen.queryByText('No results available')).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  test('clicking into the box reopens results that are already there', async () => {
    vi.mocked(performSearch).mockResolvedValue([poiResult] as any);

    render(<Wrapper {...defaultProps} />);
    const input = await searchFor('bump');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));

    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'false'));

    await userEvent.click(input);
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
  });

  test('a search survives focus moving to another field', async () => {
    vi.mocked(performSearch).mockResolvedValue([poiResult] as any);

    render(
      <>
        <Wrapper {...defaultProps} />
        <button type="button">elsewhere in the edit view</button>
      </>
    );
    const input = await searchFor('bump');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));

    // The open listbox aria-hides the rest of the page, so close it the way a click outside would
    // before moving focus away.
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'false'));
    await userEvent.click(screen.getByRole('button', { name: /elsewhere/ }));

    expect(input).toHaveValue('bump');
    await userEvent.click(input);
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
    // Coming back must not have cost a second call to the geocoder.
    expect(performSearch).toHaveBeenCalledTimes(1);
  });

  test('the chevron opens an empty-state message when nothing has been typed', async () => {
    render(<Wrapper {...defaultProps} />);
    fireEvent.pointerDown(document.querySelector('button[aria-expanded]')!, { button: 0 });

    await waitFor(() => expect(screen.getByText('No results available')).toBeInTheDocument());
    expect(performSearch).not.toHaveBeenCalled();
  });

  test('a result can be chosen with the keyboard alone', async () => {
    vi.mocked(performSearch).mockResolvedValue([poiResult, nominatimResult] as any);

    render(<Wrapper {...defaultProps} />);
    const input = await searchFor('bump');

    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));
    input.focus();
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => expect(defaultProps.onSelectResult).toHaveBeenCalledTimes(1));
    expect(defaultProps.onSelectResult).toHaveBeenCalledWith(poiResult.feature);
  });
});
