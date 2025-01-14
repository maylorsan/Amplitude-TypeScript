import { Timeline } from '../src/timeline';
import { Event, Plugin, PluginType } from '@amplitude/analytics-types';
import { OPT_OUT_MESSAGE } from '../src/messages';
import { useDefaultConfig } from './helpers/default';
import { createTrackEvent } from '../src/utils/event-builder';

describe('timeline', () => {
  let timeline = new Timeline();

  beforeEach(() => {
    timeline = new Timeline();
  });

  test('should update event using before/enrichment plugin', async () => {
    const beforeSetup = jest.fn().mockReturnValue(Promise.resolve());
    const beforeExecute = jest.fn().mockImplementation((event: Event) =>
      Promise.resolve({
        ...event,
        event_id: '1',
      }),
    );
    const before: Plugin = {
      name: 'plugin:before',
      type: PluginType.BEFORE,
      setup: beforeSetup,
      execute: beforeExecute,
    };
    const enrichmentSetup = jest.fn().mockReturnValue(Promise.resolve());
    const enrichmentExecute = jest.fn().mockImplementation((event: Event) =>
      Promise.resolve({
        ...event,
        user_id: '2',
      }),
    );
    const enrichment: Plugin = {
      name: 'plugin:enrichment',
      type: PluginType.ENRICHMENT,
      setup: enrichmentSetup,
      execute: enrichmentExecute,
    };

    const destinationSetup = jest.fn().mockReturnValue(Promise.resolve());
    const destinationExecute = jest
      .fn()
      // error once
      .mockImplementationOnce((event: Event) => {
        expect(event.event_id).toBe('1');
        expect(event.user_id).toBe('2');
        return Promise.reject({});
      })
      // success for the rest
      .mockImplementation((event: Event) => {
        expect(event.event_id).toBe('1');
        expect(event.user_id).toBe('2');
        return Promise.resolve();
      });
    const destination: Plugin = {
      name: 'plugin:destination',
      type: PluginType.DESTINATION,
      setup: destinationSetup,
      execute: destinationExecute,
    };
    const config = useDefaultConfig();
    // register
    await timeline.register(before, config);
    await timeline.register(enrichment, config);
    await timeline.register(destination, config);
    expect(beforeSetup).toHaveBeenCalledTimes(1);
    expect(enrichmentSetup).toHaveBeenCalledTimes(1);
    expect(destinationSetup).toHaveBeenCalledTimes(1);
    expect(timeline.plugins.length).toBe(3);
    const event = (id: number): Event => ({
      event_type: `${id}:event_type`,
    });
    await Promise.all([
      timeline.push(event(1), config).then(() => timeline.push(event(1.1), config)),
      timeline
        .push(event(2), config)
        .then(() => Promise.all([timeline.push(event(2.1), config), timeline.push(event(2.2), config)])),
      timeline
        .push(event(3), config)
        .then(() =>
          Promise.all([
            timeline
              .push(event(3.1), config)
              .then(() => Promise.all([timeline.push(event(3.11), config), timeline.push(event(3.12), config)])),
            timeline.push(event(3.2), config),
          ]),
        ),
    ]);
    expect(beforeExecute).toHaveBeenCalledTimes(10);
    expect(enrichmentExecute).toHaveBeenCalledTimes(10);
    expect(destinationExecute).toHaveBeenCalledTimes(10);

    // deregister
    await timeline.deregister(before.name);
    await timeline.deregister(enrichment.name);
    await timeline.deregister(destination.name);
    expect(timeline.plugins.length).toBe(0);
  });

  describe('push', () => {
    test('should handle opt out', async () => {
      const event = {
        event_type: 'hello',
      };
      const config = useDefaultConfig();
      config.optOut = true;
      const results = await timeline.push(event, config);
      expect(results).toEqual({
        event,
        code: 0,
        message: OPT_OUT_MESSAGE,
      });
    });
  });

  describe('apply', () => {
    test('should handle undefined event', async () => {
      const beforeSetup = jest.fn().mockReturnValueOnce(Promise.resolve());
      const beforeExecute = jest.fn().mockImplementationOnce((event: Event) =>
        Promise.resolve({
          ...event,
          event_id: '1',
        }),
      );
      const before: Plugin = {
        name: 'plugin:before',
        type: PluginType.BEFORE,
        setup: beforeSetup,
        execute: beforeExecute,
      };
      const config = useDefaultConfig();
      await timeline.register(before, config);
      await timeline.apply(undefined);
      await timeline.deregister(before.name);
      expect(beforeExecute).toHaveBeenCalledTimes(0);
    });
  });

  describe('flush', () => {
    test('should flush events', async () => {
      const setup = jest.fn().mockReturnValueOnce(Promise.resolve(undefined));
      const execute = jest.fn().mockReturnValue(Promise.resolve(undefined));
      const flush = jest.fn().mockReturnValue(Promise.resolve(undefined));
      const plugin = {
        name: 'mock',
        type: PluginType.DESTINATION,
        setup,
        execute,
        flush,
      };
      const config = useDefaultConfig();
      await timeline.register(plugin, config);
      void timeline.push(createTrackEvent('a'), config);
      void timeline.push(createTrackEvent('b'), config);
      void timeline.push(createTrackEvent('c'), config);
      void timeline.push(createTrackEvent('d'), config);
      expect(timeline.queue.length).toBe(4);
      await timeline.flush();
      expect(timeline.queue.length).toBe(0);
      expect(execute).toBeCalledTimes(4);
      expect(flush).toBeCalledTimes(1);
    });
  });
});
