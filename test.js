class DeployContext {
    constructor(serviceContext) {
        this.test = "Hello"
    }
}

let dc = new DeployContext({});
console.log(dc);
console.log(dc.test);
console.log(dc.notfound);
console.log(dc instanceof DeployContext);