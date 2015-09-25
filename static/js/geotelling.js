/* globals: d3 */
window.GeoTelling = (function(){
'use strict';

/*
  © Cynthia Brewer, Mark Harrower and The Pennsylvania State University
    http://colorbrewer2.org/
*/
var colorbrewer = {
  PuRd: ['rgb(247,244,249)','rgb(231,225,239)','rgb(212,185,218)','rgb(201,148,199)','rgb(223,101,176)','rgb(231,41,138)','rgb(206,18,86)','rgb(152,0,67)','rgb(103,0,31)']
};

var tooltipOffset = {x: 5, y: -25};

function GeoTelling(node, config, site) {
  var self = this;
  this.node = node;
  this.config = config;
  this.site = site;

  this.currentValue = config.defaultDataKey;

  this.projection = d3.geo.albers()
      .center([0, 51.1])
      .rotate([-10.4, 0])
      .precision(0.1);
  this.geopath = d3.geo.path();
  this.svg = d3.select(node).select('.geotelling-map').append("svg");
  this.svgFeatures = this.svg.append("g")
      .attr("class", "features");
  this.tooltip = d3.select(node).append("div").attr("class", "geotelling-tooltip");
  this.color = d3.scale.quantize();
  d3.select('.geotelling-pagination').selectAll('li').data(this.config.steps)
    .enter().append('li')
      .append('a')
      .text(function(d, i){ return i + 1; })
      .attr('href', function(d, i){ return '#' + (i + 1); })
      .on('click', function() {
        d3.event.preventDefault();
        d3.selectAll('.geotelling-pagination li a').classed('active', false);
        var step = parseInt(d3.select(this).classed('active', true).attr('href').substr(1)) - 1;
        self.goToStep(self.config.steps[step], step);
        return false;
      });
  d3.select('.geotelling-pagination li a').classed('active', true);
}

GeoTelling.prototype.resize = function() {
  this.width = document.body.offsetWidth;
  this.height = this.width * 0.8;
  this.dim = Math.min(this.width, this.height);
  this.projection
      .scale(7 * this.dim)
      .translate([this.width / 2, this.height / 2]);
  this.geopath.projection(this.projection);
  this.svg
    .attr("width", this.width)
    .attr("height", this.height);
};

GeoTelling.prototype.redata = function(data) {
  // React to data changes
  var self = this;
  this.features = topojson.feature(data, data.objects.data).features;

  this.analyseData(this.features);

  this.refresh();
    // .on("click", clicked);
};

GeoTelling.prototype.goToStep = function(step, stepnum) {
  var self = this;
  if (step.dataKey !== undefined) {
    this.currentValue = step.dataKey;
  }
  if (step.zoomKey !== undefined) {
    this.svgFeatures.selectAll('path').each(function(d){
      if (d.properties.label === step.zoomKey) {
        self.zoomToFeature(d);
      }
    });
  } else {
    self.zoomToFeature(null);
  }
  if (step.circles === undefined) {
    step.circles = [];
  }
  var klass = 'circles-' + stepnum;
  var circles = this.svgFeatures.selectAll('.custom-features').data(step.circles);
  circles.enter()
    .append('circle')
    .classed(klass, true)
    .classed('custom-features', true)
    .attr('cx', function(d){
      return self.projection(d.latlng.slice().reverse())[0];
    })
    .attr('cy', function(d){ return self.projection(d.latlng.slice().reverse())[1]; })
    .attr('r', '5')
    .on("mouseover", function(d){ return self.showTooltip(d);})
    .on("mousemove", function(d){ return self.moveTooltip(d);})
    .on("mouseout", function(d){ return self.hideTooltip(d);});
  circles.exit().remove();

  d3.select(this.node).selectAll('.geotelling-item').classed('active', false);

  d3.select(this.node).select('.geotelling-item:nth-child('+ (stepnum + 1) +')').classed('active', true);
  this.refresh();
};

GeoTelling.prototype.refresh = function() {
  var self = this;

  var paths = this.svgFeatures.selectAll("path")
    .data(this.features);

  paths
    .enter()
    .append("path")
      .attr("d", this.geopath)
      .on("mouseover", function(d){ return self.showTooltip(d);})
      .on("mousemove", function(d){ return self.moveTooltip(d);})
      .on("mouseout", function(d){ return self.hideTooltip(d);});

  paths
    .style("fill", function(d) {
      return self.color(d.properties[self.currentValue]);
    });
};


var dataValueGetter = function(key) {
  return function(d) {
    return d.properties[key];
  };
};


GeoTelling.prototype.analyseData = function(features) {
  var min = Infinity, max = -Infinity;
  this.config.steps.forEach(function(step, i){
    if (step.dataKey !== undefined) {
      min = Math.min(min, d3.min(features, dataValueGetter(step.dataKey)));
      max = Math.max(max, d3.max(features, dataValueGetter(step.dataKey)));
    }
  });
  this.color.domain([min, max]).range(colorbrewer.PuRd);
};


GeoTelling.prototype.init = function() {
  var self = this;

  this.resize();

  d3.json(this.site.baseurl + '/static/geo/' + this.config.geopath, function(error, geodata) {
    if (error) {
      return console.log(error); //unknown error, check the console
    }
    self.redata(geodata);
  });
};


//Create a tooltip, hidden at the start
GeoTelling.prototype.showTooltip = function (d) {
  if (d.properties !== undefined) {
    this.tooltip.style("display","block")
        .html('<h4>' + d.properties.label + '</h4><p><strong>' + Math.round(d.properties[this.currentValue] * 10) / 10 + '</strong> Psychiatrische Betten pro 100.000 Einwohner</p>');
  } else {
    this.tooltip.style("display","block")
        .text(d.label);
  }
};

GeoTelling.prototype.moveTooltip = function() {
  this.tooltip.style("top", (d3.event.pageY + tooltipOffset.y) + "px")
              .style("left", (d3.event.pageX + tooltipOffset.x) + "px");
};

GeoTelling.prototype.hideTooltip = function() {
  this.tooltip.style("display","none");
};

GeoTelling.prototype.zoomToFeature = function(d) {
  var x, y, k;
  if (d && this.centered !== d) {
    // Compute the new map center and scale to zoom to
    var centroid = this.geopath.centroid(d);
    var b = this.geopath.bounds(d);
    x = centroid[0];
    y = centroid[1];
    k = 0.8 / Math.max((b[1][0] - b[0][0]) / this.width, (b[1][1] - b[0][1]) / this.height);
    this.centered = d;
  } else {
    x = this.width / 2;
    y = this.height / 2;
    k = 1;
    this.centered = null;
  }

  // Highlight the new feature
  // this.features.selectAll("path")
  //     .classed("highlighted",function(d) {
  //         return d === centered;
  //     })
  //     .style("stroke-width", 1 / k + "px"); // Keep the border width constant

  //Zoom and re-center the map
  //Uncomment .transition() and .duration() to make zoom gradual
  this.svgFeatures
    .transition()
    .duration(500)
    .attr("transform","translate(" + (this.width / 2) + "," + (this.height / 2) + ")scale(" + k + ")translate(" + -x + "," + -y + ")");
};


return GeoTelling;

}());