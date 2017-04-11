class BindContext {
    constructor(dependencyServiceContext, dependentOfServiceContext) {
        this.dependencyServiceContext = dependencyServiceContext;
        this.dependentOfServiceContext = dependentOfServiceContext;
        //Should anything else go here?
    }
}

module.exports = exports = BindContext;
