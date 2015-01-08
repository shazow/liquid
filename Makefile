PACKAGE_FILE=package.json
INSTALL_OUT=node_modules

all: setup

$(INSTALL_OUT): $(PACKAGE_FILE)
	npm install .
	touch $(INSTALL_OUT)

setup: $(INSTALL_OUT)

test: setup
	npm test .
