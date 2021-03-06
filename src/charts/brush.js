define(function(require) {
    'use strict';

    const d3Array = require('d3-array');
    const d3Axis = require('d3-axis');
    const d3Brush = require('d3-brush');
    const d3Ease = require('d3-ease');
    const d3Scale = require('d3-scale');
    const d3Shape = require('d3-shape');
    const d3Dispatch = require('d3-dispatch');
    const d3Selection = require('d3-selection');
    const d3Time = require('d3-time');
    const d3Transition = require('d3-transition');
    const d3TimeFormat = require('d3-time-format');

    const colorHelper = require('./helpers/colors');
    const timeAxisHelper = require('./helpers/timeAxis');

    const {axisTimeCombinations} = require('./helpers/constants');

    const {uniqueId} = require('./helpers/common');
    const {line} = require('./helpers/loadingStates');


    /**
     * @typedef BrushChartData
     * @type {Object[]}
     * @property {Number} value        Value to chart (required)
     * @property {Date} date           Date of the value (required)
     *
     * @example
     * [
     *     {
     *         value: 1,
     *         date: '2011-01-06T00:00:00Z'
     *     },
     *     {
     *         value: 2,
     *         date: '2011-01-07T00:00:00Z'
     *     }
     * ]
     */

    /**
     * Brush Chart reusable API class that renders a
     * simple and configurable brush chart.
     *
     * @module Brush
     * @tutorial brush
     * @requires d3-array, d3-axis, d3-brush, d3-ease, d3-scale, d3-shape, d3-selection, d3-time, d3-time-format
     *
     * @example
     * let brushChart = brush();
     *
     * brushChart
     *     .height(500)
     *     .width(800);
     *
     * d3Selection.select('.css-selector')
     *     .datum(dataset)
     *     .call(brushChart);
     *
     */

    return function module() {

        let margin = {
                top: 20,
                right: 20,
                bottom: 30,
                left: 20
            },
            width = 960,
            height = 500,
            loadingState = line,
            data,
            svg,

            ease = d3Ease.easeQuadOut,

            dateLabel = 'date',
            valueLabel = 'value',

            dateRange = [null, null],

            chartWidth, chartHeight,
            xScale, yScale,
            xAxis,

            xAxisFormat = null,
            xTicks = null,
            xAxisCustomFormat = null,
            locale,

            brush,
            chartBrush,
            handle,

            tickPadding = 5,

            gradient = colorHelper.colorGradients.greenBlue,
            gradientId = uniqueId('brush-area-gradient'),

            // Dispatcher object to broadcast the mouse events
            // Ref: https://github.com/mbostock/d3/wiki/Internals#d3_dispatch
            dispatcher = d3Dispatch.dispatch('customBrushStart', 'customBrushEnd'),

            // extractors
            getValue = ({value}) => value,
            getDate = ({date}) => date;


        /**
         * This function creates the graph using the selection as container
         * @param  {D3Selection} _selection A d3 selection that represents
         *                                  the container(s) where the chart(s) will be rendered
         * @param {BrushChartData} _data The data to attach and generate the chart
         */
        function exports(_selection){
            _selection.each(function(_data){
                chartWidth = width - margin.left - margin.right;
                chartHeight = height - margin.top - margin.bottom;
                data = cleanData(cloneData(_data));

                buildScales();
                buildAxis();
                buildSVG(this);
                buildGradient();
                buildBrush();
                drawArea();
                drawAxis();
                drawBrush();
                drawHandles();
            });
        }

        /**
         * Creates the d3 x axis, setting orientation
         * @private
         */
        function buildAxis(){
            let minor, major;

            if (xAxisFormat === 'custom' && typeof xAxisCustomFormat === 'string') {
                minor = {
                    tick: xTicks,
                    format: d3TimeFormat.timeFormat(xAxisCustomFormat)
                };
            } else {
                ({minor, major} = timeAxisHelper.getXAxisSettings(data, width, xAxisFormat));
            }

            xAxis = d3Axis.axisBottom(xScale)
                .ticks(minor.tick)
                .tickSize(10, 0)
                .tickPadding([tickPadding])
                .tickFormat(minor.format);
        }

        /**
         * Creates the brush element and attaches a listener
         * @return {void}
         */
        function buildBrush() {
            brush = d3Brush.brushX()
                .extent([[0, 0], [chartWidth, chartHeight]])
                .on('brush', handleBrushStart)
                .on('end', handleBrushEnd);
        }

        /**
         * Builds containers for the chart, the axis and a wrapper for all of them
         * Also applies the Margin convention
         * @private
         */
        function buildContainerGroups(){
            let container = svg
              .append('g')
                .classed('container-group', true)
                .attr('transform', `translate(${margin.left}, ${margin.top})`);

            container
              .append('g')
                .classed('chart-group', true);
            container
              .append('g')
                .classed('metadata-group', true);
            container
              .append('g')
                .classed('x-axis-group', true);
            container
              .append('g')
                .classed('brush-group', true);
        }

        /**
         * Creates the gradient on the area
         * @return {void}
         */
        function buildGradient() {
            let metadataGroup = svg.select('.metadata-group');

            metadataGroup.append('linearGradient')
                .attr('id', gradientId)
                .attr('gradientUnits', 'userSpaceOnUse')
                .attr('x1', 0)
                .attr('x2', xScale(data[data.length - 1].date))
                .attr('y1', 0)
                .attr('y2', 0)
              .selectAll('stop')
                .data([
                    {offset: '0%', color: gradient[0]},
                    {offset: '100%', color: gradient[1]}
                ])
              .enter().append('stop')
                .attr('offset', ({offset}) => offset)
                .attr('stop-color', ({color}) => color);
        }

        /**
         * Creates the x and y scales of the graph
         * @private
         */
        function buildScales(){
            xScale = d3Scale.scaleTime()
                .domain(d3Array.extent(data, getDate ))
                .range([0, chartWidth]);

            yScale = d3Scale.scaleLinear()
                .domain([0, d3Array.max(data, getValue)])
                .range([chartHeight, 0]);
        }

        /**
         * Builds the SVG element that will contain the chart
         * @param  {HTMLElement} container DOM element that will work as the container of the graph
         * @private
         */
        function buildSVG(container){
            if (!svg) {
                svg = d3Selection.select(container)
                  .append('svg')
                    .classed('britechart brush-chart', true);

                buildContainerGroups();
            }

            svg
                .attr('width', width)
                .attr('height', height);
        }

        /**
         * Cleaning data casting the values and dates to the proper type while keeping
         * the rest of properties on the data
         * @param  {BrushChartData} originalData        Raw data from the container
         * @return {BrushChartData}                     Clean data
         * @private
         */
        function cleanData(originalData) {
            return originalData.reduce((acc, d) => {
                d.date = new Date(d[dateLabel]);
                d.value = +d[valueLabel];

                return [...acc, d];
            }, []);
        }

        /**
         * Clones the passed array of data
         * @param  {Object[]} dataToClone Data to clone
         * @return {Object[]}             Cloned data
         */
        function cloneData(dataToClone) {
            return JSON.parse(JSON.stringify(dataToClone));
        }

        /**
         * Draws the x axis on the svg object within its group
         *
         * @private
         */
        function drawAxis(){
            svg.select('.x-axis-group')
              .append('g')
                .attr('class', 'x axis')
                .attr('transform', `translate(0, ${chartHeight})`)
                .call(xAxis);
        }

        /**
         * Draws the area that is going to represent the data
         *
         * @return {void}
         */
        function drawArea() {
            // Create and configure the area generator
            let area = d3Shape.area()
                .x(({date}) => xScale(date))
                .y0(chartHeight)
                .y1(({value}) => yScale(value))
                .curve(d3Shape.curveBasis);

            // Create the area path
            svg.select('.chart-group')
              .append('path')
                .datum(data)
                .attr('class', 'brush-area')
                .attr('d', area);
        }

        /**
         * Draws the Brush components on its group
         * @return {void}
         */
        function drawBrush() {
            chartBrush = svg.select('.brush-group')
                                .call(brush);

            // Update the height of the brushing rectangle
            chartBrush.selectAll('rect')
                .classed('brush-rect', true)
                .attr('height', chartHeight);

            chartBrush.selectAll('.selection')
                .attr('fill', `url(#${gradientId})`);
        }

        /**
         * Draws a handle for the Brush section
         * @return {void}
         */
        function drawHandles() {
            let handleFillColor = colorHelper.colorSchemasHuman.grey[1];

            // Styling
            handle = chartBrush
                        .selectAll('.handle.brush-rect')
                        .style('fill', handleFillColor);
        }

        /**
         * When a brush event starts, we can extract info from the extension
         * of the brush.
         *
         * @return {void}
         */
        function handleBrushStart() {
            let s = d3Selection.event.selection,
                dateExtent = s.map(xScale.invert);

            dispatcher.call('customBrushStart', this, dateExtent);
            // updateHandlers(dateExtent);
        }

        /**
         * Processes the end brush event, snapping the boundaries to days
         * as showed on the example on https://bl.ocks.org/mbostock/6232537
         * @return {void}
         * @private
         */
        function handleBrushEnd() {
            if (!d3Selection.event.sourceEvent) return; // Only transition after input.
            if (!d3Selection.event.selection) return; // Ignore empty selections.

            let s = d3Selection.event.selection,
                dateExtent = s.map(xScale.invert),
                dateExtentRounded = dateExtent.map(d3Time.timeDay.round);

            // If empty when rounded, use floor & ceil instead.
            if (dateExtentRounded[0] >= dateExtentRounded[1]) {
                dateExtentRounded[0] = d3Time.timeDay.floor(dateExtent[0]);
                dateExtentRounded[1] = d3Time.timeDay.offset(dateExtentRounded[0]);
            }

            d3Selection.select(this)
                .transition()
                .call(d3Selection.event.target.move, dateExtentRounded.map(xScale));

            dispatcher.call('customBrushEnd', this, dateExtentRounded);
        }

        /**
         * Sets a new brush extent within the passed percentage positions
         * @param {Number} a Percentage of data that the brush start with
         * @param {Number} b Percentage of data that the brush ends with
         * @example
         *     setBrushByPercentages(0.25, 0.5)
         */
        function setBrushByPercentages(a, b) {
            let x0 = a * chartWidth,
                x1 = b * chartWidth;

            brush
                .move(chartBrush, [x0, x1]);
        }

        /**
         * Sets a new brush extent within the passed dates
         * @param {String | Date} dateA Initial Date
         * @param {String | Date} dateB End Date
         */
        function setBrushByDates(dateA, dateB) {
            let x0 = xScale(new Date(dateA)),
                x1 = xScale(new Date(dateB));

            brush
                .move(chartBrush, [x0, x1]);
        }

        /**
         * Updates visibility and position of the brush handlers
         * @param  {Number[]} dateExtent Date range
         * @return {void}
         */
        function updateHandlers(dateExtent) {
            if (dateExtent === null) {
                handle.attr('display', 'none');
            } else {
                handle
                    .attr('display', null)
                    .attr('transform', function(d, i) {
                        return `translate(${dateExtent[i]},${chartHeight / 2})`;
                    });
            }
        }

        // API

        /**
         * Exposes the constants to be used to force the x axis to respect a certain granularity
         * current options: MINUTE_HOUR, HOUR_DAY, DAY_MONTH, MONTH_YEAR
         * @example
         *     brush.xAxisCustomFormat(brush.axisTimeCombinations.HOUR_DAY)
         */
        exports.axisTimeCombinations = axisTimeCombinations;

        /**
         * Gets or Sets the dateRange for the selected part of the brush
         * @param  {String[]} _x Desired dateRange for the graph
         * @return { dateRange | module} Current dateRange or Chart module to chain calls
         * @public
         */
        exports.dateRange = function(_x) {
            if (!arguments.length) {
                return dateRange;
            }
            dateRange = _x;

            if (Array.isArray(dateRange)) {
                setBrushByDates(...dateRange);
            }

            return this;
        };

        /**
         * Gets or Sets the gradient of the chart
         * @param  {String[]} _x        Desired gradient for the graph
         * @return {String | Module}    Current gradient or Chart module to chain calls
         * @public
         */
        exports.gradient = function(_x) {
            if (!arguments.length) {
                return gradient;
            }
            gradient = _x;

            return this;
        };

        /**
         * Gets or Sets the height of the chart
         * @param  {Number} _x          Desired width for the graph
         * @return {Number | Module}    Current height or Chart module to chain calls
         * @public
         */
        exports.height = function(_x) {
            if (!arguments.length) {
                return height;
            }
            height = _x;

            return this;
        };

        /**
         * Gets or Sets the loading state of the chart
         * @param  {string} markup Desired markup to show when null data
         * @return { loadingState | module} Current loading state markup or Chart module to chain calls
         * @public
         */
        exports.loadingState = function(_markup) {
            if (!arguments.length) {
                return loadingState;
            }
            loadingState = _markup;

            return this;
        };

        /**
         * Pass language tag for the tooltip to localize the date.
         * Feature uses Intl.DateTimeFormat, for compatability and support, refer to
         * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/DateTimeFormat
         * @param  {String} _x  must be a language tag (BCP 47) like 'en-US' or 'fr-FR'
         * @return { (String|Module) }    Current locale or module to chain calls
         */
        exports.locale = function(_x) {
            if (!arguments.length) {
                return locale;
            }
            locale = _x;

            return this;
        };

        /**
         * Gets or Sets the margin of the chart
         * @param  {Object} _x          Margin object to get/set
         * @return {Object | Module}    Current margin or Chart module to chain calls
         * @public
         */
        exports.margin = function(_x) {
            if (!arguments.length) {
                return margin;
            }
            margin = _x;

            return this;
        };

        /**
         * Exposes an 'on' method that acts as a bridge with the event dispatcher
         * We are going to expose this events:
         * customMouseOver, customMouseMove and customMouseOut
         *
         * @return {module} Bar Chart
         * @public
         */
        exports.on = function() {
            let value = dispatcher.on.apply(dispatcher, arguments);

            return value === dispatcher ? exports : value;
        };

        /**
         * Gets or Sets the width of the chart
         * @param  {Number} _x          Desired width for the graph
         * @return {Number | Module}    Current width or Chart module to chain calls
         * @public
         */
        exports.width = function(_x) {
            if (!arguments.length) {
                return width;
            }
            width = _x;

            return this;
        };

        /**
         * Exposes the ability to force the chart to show a certain x format
         * It requires a `xAxisFormat` of 'custom' in order to work.
         * @param  {String} _x              Desired format for x axis
         * @return {String | Module}        Current format or module to chain calls
         */
        exports.xAxisCustomFormat = function(_x) {
            if (!arguments.length) {
              return xAxisCustomFormat;
            }
            xAxisCustomFormat = _x;

            return this;
        };

        /**
         * Exposes the ability to force the chart to show a certain x axis grouping
         * @param  {String} _x          Desired format
         * @return {String | Module}    Current format or module to chain calls
         * @example
         *     brush.xAxisFormat(brush.axisTimeCombinations.HOUR_DAY)
         */
        exports.xAxisFormat = function(_x) {
            if (!arguments.length) {
              return xAxisFormat;
            }
            xAxisFormat = _x;

            return this;
        };

        /**
         * Exposes the ability to force the chart to show a certain x ticks. It requires a `xAxisCustomFormat` of 'custom' in order to work.
         * NOTE: This value needs to be a multiple of 2, 5 or 10. They won't always work as expected, as D3 decides at the end
         * how many and where the ticks will appear.
         *
         * @param  {Number} _x              Desired number of x axis ticks (multiple of 2, 5 or 10)
         * @return {Number | Module}        Current number or ticks or module to chain calls
         */
        exports.xTicks = function(_x) {
            if (!arguments.length) {
              return xTicks;
            }
            xTicks = _x;

            return this;
        };

        return exports;
    };

});
