import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { IntroRegion } from '../src/components/IntroRegion';
import type { RouteDefinition } from '../src/navigation/routes';
import type { MediaItem } from '../src/media/player';

const mockRoute: RouteDefinition = {
  id: 'home',
  label: 'Home',
  shortLabel: 'H',
  eyebrow: 'Welcome back',
  title: 'Your television, in one place',
  description:
    'Continue watching, return to live television, or discover something new.',
};

describe('IntroRegion', () => {
  it('does not render any text when focusedItem is null/undefined', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <IntroRegion route={mockRoute} focusedItem={null} />,
      );
    });

    const root = renderer!.root;
    const textNodes = root.findAllByType(Text);
    expect(textNodes).toHaveLength(0);

    act(() => {
      renderer?.unmount();
    });
  });

  it('renders metadata, title, and description when item is focused', () => {
    const mockItem: MediaItem = {
      id: 'ch-11',
      kind: 'live',
      title: 'חדשות הערב',
      channelName: 'כאן 11',
      channelNumber: '11',
      imageUrl: 'https://example.com/kan11.jpg',
      description: 'מהדורת החדשות המרכזית של כאן 11',
      timeRange: '20:00 - 21:00',
    };

    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = ReactTestRenderer.create(
        <IntroRegion route={mockRoute} focusedItem={mockItem} />,
      );
    });

    const root = renderer!.root;
    const textNodes = root.findAllByType(Text);
    const texts = textNodes.map(node => node.props.children);

    expect(texts).toContain('חדשות הערב');
    expect(texts).toContain('מהדורת החדשות המרכזית של כאן 11');

    act(() => {
      renderer?.unmount();
    });
  });
});
