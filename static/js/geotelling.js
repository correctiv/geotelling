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

var render = function(template, context) {
  return template.replace(/\{(\w+)\}/g, function(match, p1) {
    return context[p1];
  });
};

var tooltipOffset = {x: 5, y: -25};

function GeoTelling(node, config, site) {
  var self = this;
  this.node = node;
  this.config = config;
  this.site = site;

  this.projection = d3.geo.albers()
      .parallels([50, 60])
      .center(this.config.center)
      .rotate(this.config.rotation)
      .precision(0.1);
  this.scales = {
    default: d3.scale.quantize()
  };
  this.geopath = d3.geo.path();
  this.svg = d3.select(node).select('.geotelling-map').append("svg");
  this.svgFeatures = this.svg.append("g")
      .attr("class", "features");
  this.legend = this.svg.append('g')
      .attr('class', 'geotelling-legend');
  this.tooltip = d3.select(node).append("div").attr("class", "geotelling-tooltip");
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
  this.stepNum = 0;
  this.step = this.config.steps[this.stepNum];
  this.currentValue = config.defaultDataKey || this.step.dataKey;
}

GeoTelling.prototype.resize = function() {
  this.width = this.node.offsetWidth;
  this.height = this.width * this.config.heightRatio;
  this.dim = Math.min(this.width, this.height);
  this.projection
      .scale(this.config.baseScale * this.dim)
      .translate([this.width / 2, this.height / 2]);
  this.geopath.projection(this.projection);
  this.svg
    .attr("width", this.width)
    .attr("height", this.height);

};

GeoTelling.prototype.redata = function(geodata, csvdata) {
  // React to data changes
  var self = this;
  if (geodata) {
    if (geodata.type === 'Topology') {
      var topoKey = this.config.topokey || 'data';
      this.features = topojson.feature(geodata, geodata.objects[topoKey]).features;
    } else {
      this.features = geodata.features;
    }
  }
  if (csvdata) {
    this.data = csvdata;
  }

  if (this.features && this.data) {
    var dataIndex = {};
    this.data.forEach(function(d) {
      dataIndex[d[self.config.joinkey]] = d;
    });
    this.features.forEach(function(d){
      var row = dataIndex[d.properties[self.config.joinkey]];
      if (row === undefined) {
        return;
      }
      for (var key in row) {
        d.properties[key] = row[key];
      }
    });
  }

  if (this.features && (!this.config.datapath || this.data)) {
    this.analyseData(this.features);
    this.refresh();
  }
};

GeoTelling.prototype.goToStep = function(step, stepnum) {
  var self = this;
  this.stepNum = stepnum;
  this.step = step;

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
      .on("mouseout", function(d){ return self.hideTooltip(d);})
      .on("touchstart", function(d){
        var tooltipShown = self.tooltip.style("display") != 'none';
        self.showTooltip(d);
        self.moveTooltip();
        self.tooltip.style("display", tooltipShown ? 'none' : 'block');
      });

  paths
    .style("fill", function(d) {

      return self.getScale()(dataValueGetter(self.currentValue)(d));
    });


  var legendRectSize = 15;
  var legendSpacing = 4;

  var scale = this.getScale();

  this.legend.attr('transform', 'translate(' + (legendRectSize * 2) + ',' + (self.height - scale.range().length * legendRectSize) + ')');

  this.legend.selectAll('.geotelling-legendparts').remove();

  var legendParts = this.legend.selectAll('.geotelling-legendparts')
    .data(scale.range())
    .enter()
      .append('g')
      .attr('class', 'geotelling-legendparts')

  legendParts
      .attr('transform', function(d, i) {
        var height = legendRectSize + legendSpacing;
        var offset =  height *  scale.range().length / 2;
        var horz = -2 * legendRectSize;
        var vert = i * height - offset;
        return 'translate(' + horz + ',' + vert + ')';
      });
  var legendRects = legendParts
    .append('rect')
      .attr('width', legendRectSize)
      .attr('height', legendRectSize)

  legendRects
      .style('fill', function(d) { return d;})
      .style('stroke', '#828282');

  var legendTexts = legendParts.append('text')
    .classed('geotelling-legend-text', true)
    .attr('x', legendRectSize + legendSpacing)
    .attr('y', legendRectSize - legendSpacing)

  legendTexts
    .text(function(d, i) {
      var extent = scale.invertExtent(d);
      return Math.floor(extent[0]) + ' - ' + Math.floor(extent[1]);
    });


};


GeoTelling.prototype.getScale = function(d) {
  if (this.step.scale !== undefined) {
    return this.scales[this.step.scale.name];
  } else {
    return this.scales.default;
  }
};


var dataValueGetter = function(key) {
  return function(d) {
    return +d.properties[key];
  };
};

GeoTelling.prototype.makeScale = function(step) {
  var min = Infinity, max = -Infinity;
  min = Math.min(min, d3.min(this.features, dataValueGetter(step.dataKey)));
  max = Math.max(max, d3.max(this.features, dataValueGetter(step.dataKey)));

  var scale = this.scales[step.scale.name];
  if (scale !== undefined) {
    var domain = scale.domain();
    min = Math.min(min, domain[0]);
    max = Math.max(max, domain[0]);
    scale.domain([min, max]);
    return scale;
  }
  return d3.scale.quantize().domain([min, max]).range(step.scale.range || colorbrewer.PuRd);
}


GeoTelling.prototype.analyseData = function(features) {
  var self = this;
  var min = Infinity, max = -Infinity;
  this.config.steps.forEach(function(step, i){
    if (step.dataKey !== undefined) {
      var scale = step.scale;
      if (scale === undefined) {
        scale = self.scales.default;
        min = Math.min(min, d3.min(features, dataValueGetter(step.dataKey)));
        max = Math.max(max, d3.max(features, dataValueGetter(step.dataKey)));
      } else {
        self.scales[step.scale.name] = self.makeScale(step);
      }
    }
  });
  this.scales.default.domain([min, max]).range(colorbrewer.PuRd);
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
  if (this.config.datapath) {
    d3.csv(this.site.baseurl + '/static/data/' + this.config.datapath, function(error, csvdata) {
      if (error) {
        return console.log(error); //unknown error, check the console
      }
      self.redata(null, csvdata);
    });
  }
};

var merge = function(a, b) {
  var obj = {};
  for (var key in a) {
    obj[key] = a[key];
  }
  for (key in b) {
    obj[key] = b[key];
  }
  return obj;
};


//Create a tooltip, hidden at the start
GeoTelling.prototype.showTooltip = function (d) {
  this.tooltip.style("display", "block");
  var value = d.properties[this.currentValue];
  var tooltipTemplate;
  if (value !== undefined) {
    tooltipTemplate = this.step.tooltip || this.config.tooltip || '{label}';
  } else {
    tooltipTemplate = this.step.tooltipUndefined || this.config.tooltipUndefined || '{label}';
  }
  var tooltipString = render(tooltipTemplate, merge(d.properties, {
    roundedValue: Math.round(value * 10) / 10,
    value: value
  }));
  this.tooltip.html(tooltipString);
};

GeoTelling.prototype.moveTooltip = function() {
  this.tooltip.style("top", (d3.event.offsetY + tooltipOffset.y) + "px")
              .style("left", (d3.event.offsetX + tooltipOffset.x) + "px");
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
